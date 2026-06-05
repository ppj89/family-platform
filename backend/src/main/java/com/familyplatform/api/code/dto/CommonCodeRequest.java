package com.familyplatform.api.code.dto;

import jakarta.validation.constraints.NotBlank;

public record CommonCodeRequest(
    @NotBlank String code,
    @NotBlank String name,
    Integer sortOrder,
    boolean active
) {
}
