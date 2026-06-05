package com.familyplatform.api.community;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CommunityPostRepository extends JpaRepository<CommunityPost, Long> {
  List<CommunityPost> findByBoardTypeOrderByCreatedAtDesc(String boardType);

  List<CommunityPost> findByBoardTypeAndFamilyIdOrderByCreatedAtDesc(String boardType, Long familyId);
}
