package com.familyplatform.api.family;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface FamilyGroupRepository extends JpaRepository<FamilyGroup, Long> {
  List<FamilyGroup> findByIdInOrderByCreatedAtAsc(List<Long> ids);
}
