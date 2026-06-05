package com.familyplatform.api.code.dto;

import jakarta.validation.constraints.NotBlank;

public record CommonCodeGroupRequest(
    @NotBlank String menuKey,
    @NotBlank String code,
    @NotBlank String name,
    boolean active
) {
}
