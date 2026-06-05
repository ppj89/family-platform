package com.familyplatform.api.baby;

import java.time.LocalDate;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface BabyRecordRepository extends JpaRepository<BabyRecord, Long> {
  List<BabyRecord> findByBabyIdOrderByRecordDateDescCreatedAtDesc(Long babyId);

  List<BabyRecord> findByBabyIdAndRecordDateBetweenOrderByRecordDateDescCreatedAtDesc(
      Long babyId, LocalDate startDate, LocalDate endDate);

  void deleteByBabyId(Long babyId);
}
