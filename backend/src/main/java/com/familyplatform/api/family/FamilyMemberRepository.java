package com.familyplatform.api.family;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface FamilyMemberRepository extends JpaRepository<FamilyMember, Long> {
  List<FamilyMember> findByFamilyIdOrderByJoinedAtAsc(Long familyId);

  List<FamilyMember> findByUserIdOrderByJoinedAtAsc(Long userId);

  Optional<FamilyMember> findByFamilyIdAndUserId(Long familyId, Long userId);
}
