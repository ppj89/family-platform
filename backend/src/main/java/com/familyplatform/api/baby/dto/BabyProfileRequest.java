package com.familyplatform.api.baby.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;
import java.time.LocalDate;

public record BabyProfileRequest(
    @NotBlank String name,
    String gender,
    @NotNull LocalDate birthDate,
    String memo,
    String photoUrl,
    BigDecimal latestHeightCm,
    BigDecimal latestWeightKg
) {
}
