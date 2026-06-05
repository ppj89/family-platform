package com.familyplatform.api.diary;

import com.familyplatform.api.diary.dto.FamilyDiaryRequest;
import com.familyplatform.api.media.MediaPolicy;
import com.familyplatform.api.security.FamilyAccessService;
import com.familyplatform.api.security.FamilyPermission;
import jakarta.validation.Valid;
import java.time.LocalDate;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/diaries")
public class FamilyDiaryController {
  private final FamilyDiaryRepository diaries;
  private final FamilyAccessService access;
  private final MediaPolicy mediaPolicy;

  public FamilyDiaryController(FamilyDiaryRepository diaries, FamilyAccessService access, MediaPolicy mediaPolicy) {
    this.diaries = diaries;
    this.access = access;
    this.mediaPolicy = mediaPolicy;
  }

  @GetMapping
  public List<FamilyDiary> list(@RequestParam(defaultValue = "1") Long familyId,
      @RequestParam LocalDate startDate, @RequestParam LocalDate endDate) {
    access.require(familyId, FamilyPermission.READ);
    return diaries.findByFamilyIdAndDiaryDateBetweenOrderByDiaryDateDescCreatedAtDesc(familyId, startDate, endDate);
  }

  @PostMapping
  @ResponseStatus(HttpStatus.CREATED)
  public FamilyDiary create(@RequestParam(defaultValue = "1") Long familyId,
      @Valid @RequestBody FamilyDiaryRequest request) {
    access.require(familyId, FamilyPermission.CREATE);
    FamilyDiary diary = new FamilyDiary();
    diary.setFamilyId(familyId);
    apply(diary, request);
    return diaries.save(diary);
  }

  @PutMapping("/{diaryId}")
  public FamilyDiary update(@PathVariable Long diaryId, @Valid @RequestBody FamilyDiaryRequest request) {
    FamilyDiary diary = diaries.findById(diaryId).orElseThrow(() -> notFound("Diary not found"));
    access.require(diary.getFamilyId(), FamilyPermission.UPDATE);
    apply(diary, request);
    return diaries.save(diary);
  }

  @DeleteMapping("/{diaryId}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void delete(@PathVariable Long diaryId) {
    FamilyDiary diary = diaries.findById(diaryId).orElseThrow(() -> notFound("Diary not found"));
    access.require(diary.getFamilyId(), FamilyPermission.DELETE);
    diaries.delete(diary);
  }

  private void apply(FamilyDiary diary, FamilyDiaryRequest request) {
    diary.setTitle(request.title().trim());
    diary.setBody(request.body());
    diary.setDiaryDate(request.diaryDate());
    diary.setWeather(request.weather());
    diary.setMood(request.mood());
    diary.setMinTemperature(request.minTemperature());
    diary.setMaxTemperature(request.maxTemperature());
    diary.setMediaUrls(mediaPolicy.validateReferences(request.mediaUrls()));
  }

  private ResponseStatusException notFound(String message) {
    return new ResponseStatusException(HttpStatus.NOT_FOUND, message);
  }
}
