package com.familyplatform.api.notification;

import com.familyplatform.api.calendar.FamilySchedule;
import com.familyplatform.api.calendar.FamilyScheduleRepository;
import com.familyplatform.api.family.FamilyMember;
import com.familyplatform.api.family.FamilyMemberRepository;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ScheduleNotificationService {
  private static final String TYPE_SCHEDULE_REMINDER = "SCHEDULE_REMINDER";
  private static final DateTimeFormatter TIME_FORMAT = DateTimeFormatter.ofPattern("HH:mm");

  private final FamilyScheduleRepository schedules;
  private final FamilyMemberRepository familyMembers;
  private final AppNotificationRepository notifications;

  public ScheduleNotificationService(FamilyScheduleRepository schedules, FamilyMemberRepository familyMembers,
      AppNotificationRepository notifications) {
    this.schedules = schedules;
    this.familyMembers = familyMembers;
    this.notifications = notifications;
  }

  @Transactional
  public int createTodayScheduleNotifications() {
    return createScheduleNotifications(LocalDate.now());
  }

  @Transactional
  public int createScheduleNotifications(LocalDate targetDate) {
    return createScheduleNotifications(targetDate, null);
  }

  @Transactional
  public int createScheduleNotifications(LocalDate targetDate, List<Long> allowedFamilyIds) {
    int created = 0;
    for (FamilySchedule schedule : schedules.findByScheduleDateOrderByScheduleTimeAsc(targetDate)) {
      if (allowedFamilyIds != null && !allowedFamilyIds.contains(schedule.getFamilyId())) {
        continue;
      }
      for (FamilyMember member : familyMembers.findByFamilyIdOrderByJoinedAtAsc(schedule.getFamilyId())) {
        if (!member.isCanRead()) {
          continue;
        }
        if (notifications.existsByUserIdAndScheduleIdAndTypeAndTargetDate(member.getUserId(), schedule.getId(),
            TYPE_SCHEDULE_REMINDER, targetDate)) {
          continue;
        }
        notifications.save(new AppNotification(member.getUserId(), schedule.getFamilyId(), schedule.getId(),
            TYPE_SCHEDULE_REMINDER, "등록된 일정이 있습니다.", notificationBody(schedule), targetDate));
        created += 1;
      }
    }
    return created;
  }

  private String notificationBody(FamilySchedule schedule) {
    String time = schedule.getScheduleTime() == null ? "시간 미정" : schedule.getScheduleTime().format(TIME_FORMAT);
    String category = schedule.getCategory() == null || schedule.getCategory().isBlank() ? "일정" : schedule.getCategory();
    return time + " " + schedule.getTitle() + " · " + category;
  }
}
