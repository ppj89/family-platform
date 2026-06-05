package com.familyplatform.api.travel.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

public record TravelRecordRequest(
    Integer sortOrder,
    @NotBlank String title,
    String category,
    BigDecimal amount,
    String note,
    @NotBlank String location,
    @NotNull Double latitude,
    @NotNull Double longitude,
    @NotNull LocalDate recordDate,
    LocalTime recordTime,
    List<String> mediaUrls
) {
}
