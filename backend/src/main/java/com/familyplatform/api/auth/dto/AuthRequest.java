package com.familyplatform.api.auth.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record AuthRequest(
    @Email @NotBlank String email,
    @NotBlank @Size(min = 10, max = 100) String password,
    Boolean forceLogin
) {
  public boolean isForceLogin() {
    return Boolean.TRUE.equals(forceLogin);
  }
}
