package com.familyplatform.api.baby.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public record BabyRecordRequest(
    @NotBlank String recordType,
    @NotNull LocalDate recordDate,
    String recordTime,
    Integer amountMl,
    BigDecimal heightCm,
    BigDecimal weightKg,
    String memo,
    List<String> mediaUrls
) {
}
