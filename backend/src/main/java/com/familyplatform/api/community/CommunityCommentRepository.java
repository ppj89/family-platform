package com.familyplatform.api.community;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CommunityCommentRepository extends JpaRepository<CommunityComment, Long> {
  List<CommunityComment> findByPostIdOrderByCreatedAtAsc(Long postId);

  void deleteByPostId(Long postId);
}
