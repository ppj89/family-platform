package com.familyplatform.api.auth.dto;

public record AuthResponse(
    String accessToken,
    Long userId,
    String email,
    String nickname,
    boolean platformAdmin
) {
}
