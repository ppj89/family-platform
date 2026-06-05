package com.familyplatform.api.travel.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.time.LocalDate;

public record TripRequest(
    @NotBlank String title,
    @NotNull LocalDate startDate,
    @NotNull LocalDate endDate,
    String description
) {
}
