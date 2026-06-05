package com.familyplatform.api.auth.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record RegisterRequest(
    @Email @NotBlank String email,
    @NotBlank @Size(min = 2, max = 30) String nickname,
    @NotBlank @Size(min = 10, max = 100) String password
) {
}
