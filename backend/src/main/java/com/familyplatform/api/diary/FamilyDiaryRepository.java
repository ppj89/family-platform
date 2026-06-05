package com.familyplatform.api.diary;

import java.time.LocalDate;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface FamilyDiaryRepository extends JpaRepository<FamilyDiary, Long> {
  List<FamilyDiary> findByFamilyIdAndDiaryDateBetweenOrderByDiaryDateDescCreatedAtDesc(
      Long familyId, LocalDate startDate, LocalDate endDate);
}
