package com.familyplatform.api.notification;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AppNotificationRepository extends JpaRepository<AppNotification, Long> {
  List<AppNotification> findByUserIdOrderByCreatedAtDesc(Long userId);

  List<AppNotification> findByUserIdAndReadAtIsNullOrderByCreatedAtDesc(Long userId);

  Optional<AppNotification> findByIdAndUserId(Long id, Long userId);

  boolean existsByUserIdAndScheduleIdAndTypeAndTargetDate(Long userId, Long scheduleId, String type,
      LocalDate targetDate);
}
