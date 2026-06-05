package com.familyplatform.api.security;

import com.familyplatform.api.family.FamilyMember;
import com.familyplatform.api.family.FamilyMemberRepository;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class FamilyAccessService {
  private final FamilyMemberRepository members;

  public FamilyAccessService(FamilyMemberRepository members) {
    this.members = members;
  }

  public AuthenticatedUser currentUser() {
    Object principal = SecurityContextHolder.getContext().getAuthentication().getPrincipal();
    if (principal instanceof AuthenticatedUser user) {
      return user;
    }
    throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Authentication required");
  }

  public List<Long> readableFamilyIds() {
    AuthenticatedUser user = currentUser();
    if (user.platformAdmin()) {
      return null;
    }
    return members.findByUserIdOrderByJoinedAtAsc(user.id()).stream()
        .filter(FamilyMember::isCanRead)
        .map(FamilyMember::getFamilyId)
        .distinct()
        .toList();
  }

  public void require(Long familyId, FamilyPermission permission) {
    AuthenticatedUser user = currentUser();
    if (user.platformAdmin()) {
      return;
    }
    FamilyMember member = members.findByFamilyIdAndUserId(familyId, user.id())
        .orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN, "Family access denied"));
    boolean allowed = switch (permission) {
      case READ -> member.isCanRead();
      case CREATE -> member.isCanCreate();
      case UPDATE -> member.isCanUpdate();
      case DELETE -> member.isCanDelete();
    };
    if (!allowed) {
      throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Family permission denied");
    }
  }
}
