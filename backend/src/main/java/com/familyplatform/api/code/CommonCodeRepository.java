package com.familyplatform.api.code;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CommonCodeRepository extends JpaRepository<CommonCode, Long> {
  List<CommonCode> findByGroupIdOrderBySortOrderAscCreatedAtAsc(Long groupId);

  void deleteByGroupId(Long groupId);
}
