package com.familyplatform.api.community;

import com.familyplatform.api.community.dto.CommunityCommentRequest;
import com.familyplatform.api.community.dto.CommunityPostDetail;
import com.familyplatform.api.community.dto.CommunityPostRequest;
import com.familyplatform.api.media.MediaPolicy;
import com.familyplatform.api.security.AuthenticatedUser;
import com.familyplatform.api.security.FamilyAccessService;
import com.familyplatform.api.user.AppUserRepository;
import jakarta.transaction.Transactional;
import jakarta.validation.Valid;
import java.util.List;
import java.util.Locale;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/community")
public class CommunityController {
  private static final String BOARD_NOTICE = "notice";
  private static final String BOARD_FREE = "free";
  private static final String BOARD_INQUIRY = "inquiry";

  private final CommunityPostRepository posts;
  private final CommunityCommentRepository comments;
  private final FamilyAccessService access;
  private final AppUserRepository users;
  private final MediaPolicy mediaPolicy;

  public CommunityController(CommunityPostRepository posts, CommunityCommentRepository comments,
      FamilyAccessService access, AppUserRepository users, MediaPolicy mediaPolicy) {
    this.posts = posts;
    this.comments = comments;
    this.access = access;
    this.users = users;
    this.mediaPolicy = mediaPolicy;
  }

  @GetMapping("/posts")
  public List<CommunityPost> listPosts(@RequestParam String boardType,
      @RequestParam(required = false) Long familyId) {
    String normalizedBoard = normalizeBoardType(boardType);
    requireBoardRead(normalizedBoard);
    if (familyId == null || BOARD_FREE.equals(normalizedBoard) || BOARD_NOTICE.equals(normalizedBoard)) {
      return posts.findByBoardTypeOrderByCreatedAtDesc(normalizedBoard);
    }
    access.require(familyId, com.familyplatform.api.security.FamilyPermission.READ);
    return posts.findByBoardTypeAndFamilyIdOrderByCreatedAtDesc(normalizedBoard, familyId);
  }

  @GetMapping("/posts/{postId}")
  public CommunityPostDetail getPost(@PathVariable Long postId) {
    CommunityPost post = posts.findById(postId).orElseThrow(() -> notFound("Post not found"));
    requirePostRead(post);
    return new CommunityPostDetail(post, comments.findByPostIdOrderByCreatedAtAsc(postId));
  }

  @PostMapping("/posts")
  @ResponseStatus(HttpStatus.CREATED)
  public CommunityPost createPost(@Valid @RequestBody CommunityPostRequest request) {
    String boardType = normalizeBoardType(request.boardType());
    requireBoardWrite(boardType);
    if (request.familyId() != null) {
      access.require(request.familyId(), com.familyplatform.api.security.FamilyPermission.CREATE);
    }
    CommunityPost post = new CommunityPost();
    post.setBoardType(boardType);
    post.setFamilyId(familyIdFor(boardType, request.familyId()));
    applyPost(post, request);
    applyPostAuthor(post);
    return posts.save(post);
  }

  @PutMapping("/posts/{postId}")
  public CommunityPost updatePost(@PathVariable Long postId, @Valid @RequestBody CommunityPostRequest request) {
    CommunityPost post = posts.findById(postId).orElseThrow(() -> notFound("Post not found"));
    requirePostWrite(post);
    String boardType = normalizeBoardType(request.boardType());
    requireBoardWrite(boardType);
    if (request.familyId() != null) {
      access.require(request.familyId(), com.familyplatform.api.security.FamilyPermission.UPDATE);
    }
    post.setBoardType(boardType);
    post.setFamilyId(familyIdFor(boardType, request.familyId()));
    applyPost(post, request);
    post.touch();
    return posts.save(post);
  }

  @DeleteMapping("/posts/{postId}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  @Transactional
  public void deletePost(@PathVariable Long postId) {
    CommunityPost post = posts.findById(postId).orElseThrow(() -> notFound("Post not found"));
    requirePostDelete(post);
    comments.deleteByPostId(postId);
    posts.deleteById(postId);
  }

  @PostMapping("/posts/{postId}/comments")
  @ResponseStatus(HttpStatus.CREATED)
  public CommunityComment createComment(@PathVariable Long postId,
      @Valid @RequestBody CommunityCommentRequest request) {
    CommunityPost post = posts.findById(postId).orElseThrow(() -> notFound("Post not found"));
    requirePostRead(post);
    if (BOARD_NOTICE.equals(post.getBoardType()) || BOARD_INQUIRY.equals(post.getBoardType())) {
      requirePlatformAdmin();
    }
    CommunityComment comment = new CommunityComment();
    comment.setPostId(postId);
    applyComment(comment, request);
    applyCommentAuthor(comment);
    return comments.save(comment);
  }

  @PutMapping("/comments/{commentId}")
  public CommunityComment updateComment(@PathVariable Long commentId,
      @Valid @RequestBody CommunityCommentRequest request) {
    CommunityComment comment = comments.findById(commentId).orElseThrow(() -> notFound("Comment not found"));
    requireCommentOwnerOrAdmin(comment);
    applyComment(comment, request);
    comment.touch();
    return comments.save(comment);
  }

  @DeleteMapping("/comments/{commentId}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void deleteComment(@PathVariable Long commentId) {
    CommunityComment comment = comments.findById(commentId).orElseThrow(() -> notFound("Comment not found"));
    requireCommentOwnerOrAdmin(comment);
    comments.deleteById(commentId);
  }

  private void applyPost(CommunityPost post, CommunityPostRequest request) {
    post.setTitle(request.title().trim());
    post.setBody(request.body());
    post.setMediaUrls(mediaPolicy.validateReferences(request.mediaUrls()));
  }

  private void applyComment(CommunityComment comment, CommunityCommentRequest request) {
    comment.setBody(request.body());
  }

  private String normalizeBoardType(String boardType) {
    String normalized = boardType == null ? "" : boardType.trim().toLowerCase(Locale.ROOT);
    if (!BOARD_NOTICE.equals(normalized) && !BOARD_FREE.equals(normalized) && !BOARD_INQUIRY.equals(normalized)) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unsupported board type");
    }
    return normalized;
  }

  private Long familyIdFor(String boardType, Long requestedFamilyId) {
    if (BOARD_FREE.equals(boardType) || BOARD_NOTICE.equals(boardType)) {
      return null;
    }
    return requestedFamilyId;
  }

  private void requireBoardRead(String boardType) {
    if (BOARD_INQUIRY.equals(boardType)) {
      requirePlatformAdmin();
    }
  }

  private void requirePostRead(CommunityPost post) {
    if (BOARD_INQUIRY.equals(post.getBoardType())) {
      requirePlatformAdmin();
    }
    if (post.getFamilyId() != null) {
      access.require(post.getFamilyId(), com.familyplatform.api.security.FamilyPermission.READ);
    }
  }

  private void requireBoardWrite(String boardType) {
    if (BOARD_NOTICE.equals(boardType) || BOARD_INQUIRY.equals(boardType)) {
      requirePlatformAdmin();
    }
  }

  private void requirePostWrite(CommunityPost post) {
    if (BOARD_NOTICE.equals(post.getBoardType()) || BOARD_INQUIRY.equals(post.getBoardType())) {
      requirePlatformAdmin();
      return;
    }
    requireOwnerOrAdmin(post.getAuthorId());
  }

  private void requirePostDelete(CommunityPost post) {
    requirePostWrite(post);
  }

  private void requireCommentOwnerOrAdmin(CommunityComment comment) {
    requireOwnerOrAdmin(comment.getAuthorId());
  }

  private void requireOwnerOrAdmin(Long authorId) {
    AuthenticatedUser user = access.currentUser();
    if (!user.platformAdmin() && !user.id().equals(authorId)) {
      throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only the author can change this content");
    }
  }

  private void requirePlatformAdmin() {
    if (!access.currentUser().platformAdmin()) {
      throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Platform admin permission required");
    }
  }

  private void applyPostAuthor(CommunityPost post) {
    AuthenticatedUser current = access.currentUser();
    post.setAuthorId(current.id());
    post.setAuthorName(displayName(current));
  }

  private void applyCommentAuthor(CommunityComment comment) {
    AuthenticatedUser current = access.currentUser();
    comment.setAuthorId(current.id());
    comment.setAuthorName(displayName(current));
  }

  private String displayName(AuthenticatedUser current) {
    return users.findById(current.id())
        .map(user -> user.getNickname() == null || user.getNickname().isBlank() ? current.email() : user.getNickname())
        .orElse(current.email());
  }

  private ResponseStatusException notFound(String message) {
    return new ResponseStatusException(HttpStatus.NOT_FOUND, message);
  }
}
