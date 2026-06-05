package com.familyplatform.api.family;

import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

@Entity
@Table(name = "family_members")
public class FamilyMember {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  private Long familyId;
  private Long userId;
  private String role;
  private boolean canRead = true;
  private boolean canCreate;
  private boolean canUpdate;
  private boolean canDelete;
  private Instant joinedAt = Instant.now();

  protected FamilyMember() {
  }

  public FamilyMember(Long familyId, Long userId, String role, boolean admin) {
    this.familyId = familyId;
    this.userId = userId;
    this.role = role;
    this.canCreate = admin;
    this.canUpdate = admin;
    this.canDelete = admin;
  }

  public Long getId() {
    return id;
  }

  public Long getFamilyId() {
    return familyId;
  }

  public Long getUserId() {
    return userId;
  }

  public String getRole() {
    return role;
  }

  public void setRole(String role) {
    this.role = role;
  }

  public boolean isCanRead() {
    return canRead;
  }

  public void setCanRead(boolean canRead) {
    this.canRead = canRead;
  }

  public boolean isCanCreate() {
    return canCreate;
  }

  public void setCanCreate(boolean canCreate) {
    this.canCreate = canCreate;
  }

  public boolean isCanUpdate() {
    return canUpdate;
  }

  public void setCanUpdate(boolean canUpdate) {
    this.canUpdate = canUpdate;
  }

  public boolean isCanDelete() {
    return canDelete;
  }

  public void setCanDelete(boolean canDelete) {
    this.canDelete = canDelete;
  }

  public Instant getJoinedAt() {
    return joinedAt;
  }
}
