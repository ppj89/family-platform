package com.familyplatform.api.travel;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TravelRecordRepository extends JpaRepository<TravelRecord, Long> {
  List<TravelRecord> findByTripIdOrderBySortOrderAscCreatedAtDesc(Long tripId);

  void deleteByTripId(Long tripId);
}
