package com.familyplatform.api.code;

import com.familyplatform.api.code.dto.CommonCodeGroupRequest;
import com.familyplatform.api.code.dto.CommonCodeRequest;
import com.familyplatform.api.security.FamilyAccessService;
import com.familyplatform.api.security.FamilyPermission;
import jakarta.transaction.Transactional;
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
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/common-code-groups")
public class CommonCodeController {
  private final CommonCodeGroupRepository groups;
  private final CommonCodeRepository codes;
  private final FamilyAccessService access;

  public CommonCodeController(CommonCodeGroupRepository groups, CommonCodeRepository codes, FamilyAccessService access) {
    this.groups = groups;
    this.codes = codes;
    this.access = access;
  }

  @GetMapping
  public List<CommonCodeGroup> listGroups(@RequestParam(defaultValue = "1") Long familyId,
      @RequestParam(defaultValue = "ledger") String menuKey) {
    access.require(familyId, FamilyPermission.READ);
    return groups.findByFamilyIdAndMenuKeyOrderByCreatedAtAsc(familyId, menuKey);
  }

  @PostMapping
  @ResponseStatus(HttpStatus.CREATED)
  public CommonCodeGroup createGroup(@RequestParam(defaultValue = "1") Long familyId,
      @Valid @RequestBody CommonCodeGroupRequest request) {
    access.require(familyId, FamilyPermission.CREATE);
    CommonCodeGroup group = new CommonCodeGroup(familyId, request.menuKey(), request.code(), request.name());
    group.setActive(request.active());
    return groups.save(group);
  }

  @PutMapping("/{groupId}")
  public CommonCodeGroup updateGroup(@PathVariable Long groupId, @Valid @RequestBody CommonCodeGroupRequest request) {
    CommonCodeGroup group = groups.findById(groupId).orElseThrow(() -> notFound("Common code group not found"));
    access.require(group.getFamilyId(), FamilyPermission.UPDATE);
    group.setMenuKey(request.menuKey());
    group.setCode(request.code());
    group.setName(request.name());
    group.setActive(request.active());
    return groups.save(group);
  }

  @DeleteMapping("/{groupId}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  @Transactional
  public void deleteGroup(@PathVariable Long groupId) {
    CommonCodeGroup group = groups.findById(groupId).orElseThrow(() -> notFound("Common code group not found"));
    access.require(group.getFamilyId(), FamilyPermission.DELETE);
    codes.deleteByGroupId(groupId);
    groups.deleteById(groupId);
  }

  @GetMapping("/{groupId}/codes")
  public List<CommonCode> listCodes(@PathVariable Long groupId) {
    CommonCodeGroup group = ensureGroup(groupId);
    access.require(group.getFamilyId(), FamilyPermission.READ);
    return codes.findByGroupIdOrderBySortOrderAscCreatedAtAsc(groupId);
  }

  @PostMapping("/{groupId}/codes")
  @ResponseStatus(HttpStatus.CREATED)
  public CommonCode createCode(@PathVariable Long groupId, @Valid @RequestBody CommonCodeRequest request) {
    CommonCodeGroup group = ensureGroup(groupId);
    access.require(group.getFamilyId(), FamilyPermission.CREATE);
    CommonCode code = new CommonCode(groupId, request.code(), request.name(), request.sortOrder());
    code.setActive(request.active());
    return codes.save(code);
  }

  @PutMapping("/{groupId}/codes/{codeId}")
  public CommonCode updateCode(@PathVariable Long groupId, @PathVariable Long codeId,
      @Valid @RequestBody CommonCodeRequest request) {
    CommonCodeGroup group = ensureGroup(groupId);
    access.require(group.getFamilyId(), FamilyPermission.UPDATE);
    CommonCode code = codes.findById(codeId)
        .filter(item -> item.getGroupId().equals(groupId))
        .orElseThrow(() -> notFound("Common code not found"));
    code.setCode(request.code());
    code.setName(request.name());
    code.setSortOrder(request.sortOrder());
    code.setActive(request.active());
    return codes.save(code);
  }

  @DeleteMapping("/{groupId}/codes/{codeId}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void deleteCode(@PathVariable Long groupId, @PathVariable Long codeId) {
    CommonCodeGroup group = ensureGroup(groupId);
    access.require(group.getFamilyId(), FamilyPermission.DELETE);
    CommonCode code = codes.findById(codeId)
        .filter(item -> item.getGroupId().equals(groupId))
        .orElseThrow(() -> notFound("Common code not found"));
    codes.delete(code);
  }

  private CommonCodeGroup ensureGroup(Long groupId) {
    return groups.findById(groupId).orElseThrow(() -> notFound("Common code group not found"));
  }

  private ResponseStatusException notFound(String message) {
    return new ResponseStatusException(HttpStatus.NOT_FOUND, message);
  }
}
