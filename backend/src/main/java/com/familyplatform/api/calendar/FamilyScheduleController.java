package com.familyplatform.api.calendar;

import com.familyplatform.api.calendar.dto.FamilyScheduleRequest;
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
@RequestMapping("/api/schedules")
public class FamilyScheduleController {
  private final FamilyScheduleRepository schedules;
  private final FamilyAccessService access;

  public FamilyScheduleController(FamilyScheduleRepository schedules, FamilyAccessService access) {
    this.schedules = schedules;
    this.access = access;
  }

  @GetMapping
  public List<FamilySchedule> list(@RequestParam(defaultValue = "1") Long familyId,
      @RequestParam LocalDate startDate, @RequestParam LocalDate endDate) {
    access.require(familyId, FamilyPermission.READ);
    return schedules.findByFamilyIdAndScheduleDateBetweenOrderByScheduleDateAscScheduleTimeAsc(
        familyId, startDate, endDate);
  }

  @PostMapping
  @ResponseStatus(HttpStatus.CREATED)
  public FamilySchedule create(@RequestParam(defaultValue = "1") Long familyId,
      @Valid @RequestBody FamilyScheduleRequest request) {
    access.require(familyId, FamilyPermission.CREATE);
    FamilySchedule schedule = new FamilySchedule();
    schedule.setFamilyId(familyId);
    apply(schedule, request);
    return schedules.save(schedule);
  }

  @PutMapping("/{scheduleId}")
  public FamilySchedule update(@PathVariable Long scheduleId, @Valid @RequestBody FamilyScheduleRequest request) {
    FamilySchedule schedule = schedules.findById(scheduleId).orElseThrow(() -> notFound("Schedule not found"));
    access.require(schedule.getFamilyId(), FamilyPermission.UPDATE);
    apply(schedule, request);
    return schedules.save(schedule);
  }

  @DeleteMapping("/{scheduleId}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void delete(@PathVariable Long scheduleId) {
    FamilySchedule schedule = schedules.findById(scheduleId).orElseThrow(() -> notFound("Schedule not found"));
    access.require(schedule.getFamilyId(), FamilyPermission.DELETE);
    schedules.delete(schedule);
  }

  private void apply(FamilySchedule schedule, FamilyScheduleRequest request) {
    schedule.setTitle(request.title().trim());
    schedule.setCalendarBasis(request.calendarBasis());
    schedule.setScheduleDate(request.scheduleDate());
    schedule.setScheduleTime(request.scheduleTime());
    schedule.setCategory(request.category());
    schedule.setMemberName(request.memberName());
    schedule.setRepeatRule(request.repeatRule());
    schedule.setMemo(request.memo());
  }

  private ResponseStatusException notFound(String message) {
    return new ResponseStatusException(HttpStatus.NOT_FOUND, message);
  }
}
