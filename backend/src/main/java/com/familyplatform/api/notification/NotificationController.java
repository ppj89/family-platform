package com.familyplatform.api.notification;

import com.familyplatform.api.security.FamilyAccessService;
import java.time.LocalDate;
import java.util.List;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/notifications")
public class NotificationController {
  private final AppNotificationRepository notifications;
  private final FamilyAccessService access;
  private final ScheduleNotificationService scheduleNotifications;

  public NotificationController(AppNotificationRepository notifications, FamilyAccessService access,
      ScheduleNotificationService scheduleNotifications) {
    this.notifications = notifications;
    this.access = access;
    this.scheduleNotifications = scheduleNotifications;
  }

  @GetMapping
  public List<AppNotification> list(@RequestParam(defaultValue = "true") boolean unreadOnly) {
    Long userId = access.currentUser().id();
    if (unreadOnly) {
      return notifications.findByUserIdAndReadAtIsNullOrderByCreatedAtDesc(userId);
    }
    return notifications.findByUserIdOrderByCreatedAtDesc(userId);
  }

  @PostMapping("/schedule-reminders")
  public NotificationGenerationResult createScheduleReminders(
      @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
    int created = scheduleNotifications.createScheduleNotifications(date == null ? LocalDate.now() : date,
        access.readableFamilyIds());
    return new NotificationGenerationResult(created);
  }

  @PatchMapping("/{notificationId}/read")
  public AppNotification markRead(@PathVariable Long notificationId) {
    AppNotification notification = notifications.findByIdAndUserId(notificationId, access.currentUser().id())
        .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Notification not found"));
    notification.markRead();
    return notifications.save(notification);
  }

  @PatchMapping("/read-all")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void markAllRead() {
    for (AppNotification notification : notifications.findByUserIdAndReadAtIsNullOrderByCreatedAtDesc(
        access.currentUser().id())) {
      notification.markRead();
      notifications.save(notification);
    }
  }

  public record NotificationGenerationResult(int created) {
  }
}
