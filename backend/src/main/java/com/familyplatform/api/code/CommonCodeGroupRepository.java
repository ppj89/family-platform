package com.familyplatform.api.code;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CommonCodeGroupRepository extends JpaRepository<CommonCodeGroup, Long> {
  List<CommonCodeGroup> findByFamilyIdAndMenuKeyOrderByCreatedAtAsc(Long familyId, String menuKey);
}
