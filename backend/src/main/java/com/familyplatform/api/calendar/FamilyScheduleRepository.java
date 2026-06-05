package com.familyplatform.api.calendar;

import java.time.LocalDate;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface FamilyScheduleRepository extends JpaRepository<FamilySchedule, Long> {
  List<FamilySchedule> findByFamilyIdAndScheduleDateBetweenOrderByScheduleDateAscScheduleTimeAsc(
      Long familyId, LocalDate startDate, LocalDate endDate);

  List<FamilySchedule> findByScheduleDateOrderByScheduleTimeAsc(LocalDate scheduleDate);
}
