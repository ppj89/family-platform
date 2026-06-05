package com.familyplatform.api.media;

import java.util.List;
import org.springframework.util.unit.DataSize;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatusCode;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

@Component
public class MediaPolicy {
  private static final HttpStatusCode PAYLOAD_TOO_LARGE = HttpStatusCode.valueOf(413);
  private static final HttpStatusCode UNSUPPORTED_MEDIA_TYPE = HttpStatusCode.valueOf(415);

  private final int maxFilesPerPost;
  private final int maxReferenceLength;
  private final long maxImageBytes;
  private final long maxVideoBytes;

  public MediaPolicy(
      @Value("${app.media.max-files-per-post:10}") int maxFilesPerPost,
      @Value("${app.media.max-reference-length:2048}") int maxReferenceLength,
      @Value("${app.media.max-image-size:8MB}") DataSize maxImageSize,
      @Value("${app.media.max-video-size:30MB}") DataSize maxVideoSize) {
    this.maxFilesPerPost = maxFilesPerPost;
    this.maxReferenceLength = maxReferenceLength;
    this.maxImageBytes = maxImageSize.toBytes();
    this.maxVideoBytes = maxVideoSize.toBytes();
  }

  public List<String> validateReferences(List<String> mediaUrls) {
    if (mediaUrls == null) {
      return List.of();
    }
    if (mediaUrls.size() > maxFilesPerPost) {
      throw new ResponseStatusException(PAYLOAD_TOO_LARGE,
          "Too many media files. Maximum is " + maxFilesPerPost);
    }
    mediaUrls.forEach(this::validateReference);
    return mediaUrls;
  }

  public String validateReference(String value) {
    if (value == null || value.isBlank()) {
      return null;
    }
    if (value.length() > maxReferenceLength) {
      throw new ResponseStatusException(PAYLOAD_TOO_LARGE,
          "Media reference is too large. Upload the file to storage first.");
    }
    return value;
  }

  public void validateUpload(MultipartFile file) {
    if (file == null || file.isEmpty()) {
      throw new ResponseStatusException(HttpStatusCode.valueOf(400), "File is required");
    }
    String contentType = file.getContentType() == null ? "" : file.getContentType().toLowerCase();
    if (contentType.startsWith("image/")) {
      requireSize(file, maxImageBytes);
      return;
    }
    if (contentType.startsWith("video/")) {
      requireSize(file, maxVideoBytes);
      return;
    }
    throw new ResponseStatusException(UNSUPPORTED_MEDIA_TYPE, "Only image and video files are allowed");
  }

  private void requireSize(MultipartFile file, long maxBytes) {
    if (file.getSize() > maxBytes) {
      throw new ResponseStatusException(PAYLOAD_TOO_LARGE, "File is too large");
    }
  }
}
