package com.familyplatform.api.community.dto;

import jakarta.validation.constraints.NotBlank;
import java.util.List;

public record CommunityPostRequest(
    @NotBlank String boardType,
    Long familyId,
    Long authorId,
    String authorName,
    @NotBlank String title,
    @NotBlank String body,
    List<String> mediaUrls
) {
}
