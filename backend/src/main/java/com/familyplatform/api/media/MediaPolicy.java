package com.familyplatform.api.media;

import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatusCode;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

@Component
public class MediaPolicy {
  private static final HttpStatusCode PAYLOAD_TOO_LARGE = HttpStatusCode.valueOf(413);

  private final int maxFilesPerPost;
  private final int maxReferenceLength;

  public MediaPolicy(
      @Value("${app.media.max-files-per-post:10}") int maxFilesPerPost,
      @Value("${app.media.max-reference-length:2048}") int maxReferenceLength) {
    this.maxFilesPerPost = maxFilesPerPost;
    this.maxReferenceLength = maxReferenceLength;
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
}
