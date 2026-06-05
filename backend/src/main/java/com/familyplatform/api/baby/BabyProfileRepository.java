package com.familyplatform.api.baby;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface BabyProfileRepository extends JpaRepository<BabyProfile, Long> {
  List<BabyProfile> findByFamilyIdOrderByCreatedAtDesc(Long familyId);
}
