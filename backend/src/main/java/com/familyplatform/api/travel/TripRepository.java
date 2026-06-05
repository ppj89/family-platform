package com.familyplatform.api.travel;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TripRepository extends JpaRepository<Trip, Long> {
  List<Trip> findByFamilyIdOrderByCreatedAtDesc(Long familyId);
}
