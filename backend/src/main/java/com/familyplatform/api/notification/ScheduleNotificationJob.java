package com.familyplatform.api.notification;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class ScheduleNotificationJob {
  private static final Logger log = LoggerFactory.getLogger(ScheduleNotificationJob.class);

  private final ScheduleNotificationService scheduleNotifications;

  public ScheduleNotificationJob(ScheduleNotificationService scheduleNotifications) {
    this.scheduleNotifications = scheduleNotifications;
  }

  @Scheduled(cron = "0 0 9 * * *", zone = "Asia/Seoul")
  public void createMorningScheduleNotifications() {
    int created = scheduleNotifications.createTodayScheduleNotifications();
    log.info("Created {} schedule notifications for today's 09:00 reminder job", created);
  }
}
