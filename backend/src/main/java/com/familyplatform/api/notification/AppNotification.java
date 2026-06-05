package com.familyplatform.api.notification;

import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import java.time.Instant;
import java.time.LocalDate;

@Entity
@Table(name = "app_notifications", uniqueConstraints = {
    @UniqueConstraint(name = "uk_app_notifications_schedule_user",
        columnNames = {"userId", "scheduleId", "type", "targetDate"})
})
public class AppNotification {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  private Long userId;
  private Long familyId;
  private Long scheduleId;
  private String type;
  private String title;
  private String body;
  private LocalDate targetDate;
  private Instant readAt;
  private Instant createdAt = Instant.now();

  protected AppNotification() {
  }

  public AppNotification(Long userId, Long familyId, Long scheduleId, String type, String title, String body,
      LocalDate targetDate) {
    this.userId = userId;
    this.familyId = familyId;
    this.scheduleId = scheduleId;
    this.type = type;
    this.title = title;
    this.body = body;
    this.targetDate = targetDate;
  }

  public Long getId() {
    return id;
  }

  public Long getUserId() {
    return userId;
  }

  public Long getFamilyId() {
    return familyId;
  }

  public Long getScheduleId() {
    return scheduleId;
  }

  public String getType() {
    return type;
  }

  public String getTitle() {
    return title;
  }

  public String getBody() {
    return body;
  }

  public LocalDate getTargetDate() {
    return targetDate;
  }

  public Instant getReadAt() {
    return readAt;
  }

  public Instant getCreatedAt() {
    return createdAt;
  }

  public void markRead() {
    this.readAt = Instant.now();
  }
}
