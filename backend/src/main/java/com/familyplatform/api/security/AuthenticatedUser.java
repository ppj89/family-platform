package com.familyplatform.api.security;

public record AuthenticatedUser(
    Long id,
    String email,
    boolean platformAdmin,
    String sessionId
) {
}
