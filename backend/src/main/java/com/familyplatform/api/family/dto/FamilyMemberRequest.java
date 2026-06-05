package com.familyplatform.api.family.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public record FamilyMemberRequest(
    @NotNull Long userId,
    @NotBlank String role,
    boolean canRead,
    boolean canCreate,
    boolean canUpdate,
    boolean canDelete
) {
}
