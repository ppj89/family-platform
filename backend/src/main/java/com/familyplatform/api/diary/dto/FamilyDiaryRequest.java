package com.familyplatform.api.diary.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.time.LocalDate;
import java.util.List;

public record FamilyDiaryRequest(
    @NotBlank String title,
    @NotBlank String body,
    @NotNull LocalDate diaryDate,
    String weather,
    String mood,
    Integer minTemperature,
    Integer maxTemperature,
    List<String> mediaUrls
) {
}
