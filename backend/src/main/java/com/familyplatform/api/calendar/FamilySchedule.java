package com.familyplatform.api.calendar;

import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;

@Entity
@Table(name = "family_schedules")
public class FamilySchedule {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  private Long familyId;
  private String title;
  private String calendarBasis;
  private LocalDate scheduleDate;
  private LocalTime scheduleTime;
  private String category;
  private String memberName;
  private String repeatRule;
  private String memo;
  private Instant createdAt = Instant.now();

  protected FamilySchedule() {
  }

  public Long getId() {
    return id;
  }

  public Long getFamilyId() {
    return familyId;
  }

  public void setFamilyId(Long familyId) {
    this.familyId = familyId;
  }

  public String getTitle() {
    return title;
  }

  public void setTitle(String title) {
    this.title = title;
  }

  public String getCalendarBasis() {
    return calendarBasis;
  }

  public void setCalendarBasis(String calendarBasis) {
    this.calendarBasis = calendarBasis;
  }

  public LocalDate getScheduleDate() {
    return scheduleDate;
  }

  public void setScheduleDate(LocalDate scheduleDate) {
    this.scheduleDate = scheduleDate;
  }

  public LocalTime getScheduleTime() {
    return scheduleTime;
  }

  public void setScheduleTime(LocalTime scheduleTime) {
    this.scheduleTime = scheduleTime;
  }

  public String getCategory() {
    return category;
  }

  public void setCategory(String category) {
    this.category = category;
  }

  public String getMemberName() {
    return memberName;
  }

  public void setMemberName(String memberName) {
    this.memberName = memberName;
  }

  public String getRepeatRule() {
    return repeatRule;
  }

  public void setRepeatRule(String repeatRule) {
    this.repeatRule = repeatRule;
  }

  public String getMemo() {
    return memo;
  }

  public void setMemo(String memo) {
    this.memo = memo;
  }

  public Instant getCreatedAt() {
    return createdAt;
  }
}
