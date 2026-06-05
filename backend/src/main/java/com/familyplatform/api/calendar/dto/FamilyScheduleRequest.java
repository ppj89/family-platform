package com.familyplatform.api.calendar.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.time.LocalDate;
import java.time.LocalTime;

public record FamilyScheduleRequest(
    @NotBlank String title,
    @NotBlank String calendarBasis,
    @NotNull LocalDate scheduleDate,
    LocalTime scheduleTime,
    String category,
    String memberName,
    String repeatRule,
    String memo
) {
}
