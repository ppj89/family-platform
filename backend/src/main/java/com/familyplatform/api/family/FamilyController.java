package com.familyplatform.api.family;

import com.familyplatform.api.family.dto.FamilyMemberRequest;
import com.familyplatform.api.security.FamilyAccessService;
import com.familyplatform.api.security.FamilyPermission;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/families")
public class FamilyController {
  private final FamilyGroupRepository familyGroups;
  private final FamilyMemberRepository familyMembers;
  private final FamilyAccessService access;

  public FamilyController(FamilyGroupRepository familyGroups, FamilyMemberRepository familyMembers,
      FamilyAccessService access) {
    this.familyGroups = familyGroups;
    this.familyMembers = familyMembers;
    this.access = access;
  }

  @GetMapping
  public List<FamilyGroup> list() {
    List<Long> familyIds = access.readableFamilyIds();
    if (familyIds == null) {
      return familyGroups.findAll();
    }
    return familyIds.isEmpty() ? List.of() : familyGroups.findByIdInOrderByCreatedAtAsc(familyIds);
  }

  @GetMapping("/{familyId}/members")
  public List<FamilyMember> listMembers(@PathVariable Long familyId) {
    ensureFamily(familyId);
    access.require(familyId, FamilyPermission.READ);
    return familyMembers.findByFamilyIdOrderByJoinedAtAsc(familyId);
  }

  @PostMapping("/{familyId}/members")
  @ResponseStatus(HttpStatus.CREATED)
  public FamilyMember addMember(@PathVariable Long familyId, @Valid @RequestBody FamilyMemberRequest request) {
    ensureFamily(familyId);
    access.require(familyId, FamilyPermission.UPDATE);
    FamilyMember member = new FamilyMember(familyId, request.userId(), request.role(), "FAMILY_ADMIN".equals(request.role()));
    applyMemberRequest(member, request);
    return familyMembers.save(member);
  }

  @PutMapping("/{familyId}/members/{memberId}")
  public FamilyMember updateMember(@PathVariable Long familyId, @PathVariable Long memberId,
      @Valid @RequestBody FamilyMemberRequest request) {
    ensureFamily(familyId);
    access.require(familyId, FamilyPermission.UPDATE);
    FamilyMember member = familyMembers.findById(memberId)
        .filter(item -> item.getFamilyId().equals(familyId))
        .orElseThrow(() -> notFound("Family member not found"));
    applyMemberRequest(member, request);
    return familyMembers.save(member);
  }

  @DeleteMapping("/{familyId}/members/{memberId}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void removeMember(@PathVariable Long familyId, @PathVariable Long memberId) {
    ensureFamily(familyId);
    access.require(familyId, FamilyPermission.DELETE);
    FamilyMember member = familyMembers.findById(memberId)
        .filter(item -> item.getFamilyId().equals(familyId))
        .orElseThrow(() -> notFound("Family member not found"));
    familyMembers.delete(member);
  }

  private void applyMemberRequest(FamilyMember member, FamilyMemberRequest request) {
    member.setRole(request.role());
    member.setCanRead(request.canRead());
    member.setCanCreate(request.canCreate());
    member.setCanUpdate(request.canUpdate());
    member.setCanDelete(request.canDelete());
  }

  private void ensureFamily(Long familyId) {
    if (!familyGroups.existsById(familyId)) {
      throw notFound("Family not found");
    }
  }

  private ResponseStatusException notFound(String message) {
    return new ResponseStatusException(HttpStatus.NOT_FOUND, message);
  }
}
