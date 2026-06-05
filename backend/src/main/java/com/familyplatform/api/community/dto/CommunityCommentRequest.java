package com.familyplatform.api.community.dto;

import jakarta.validation.constraints.NotBlank;

public record CommunityCommentRequest(
    Long authorId,
    String authorName,
    @NotBlank String body
) {
}
