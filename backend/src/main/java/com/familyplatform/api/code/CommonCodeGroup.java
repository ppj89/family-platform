package com.familyplatform.api.code;

import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

@Entity
@Table(name = "common_code_groups")
public class CommonCodeGroup {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  private Long familyId;
  private String menuKey;
  private String code;
  private String name;
  private boolean active = true;
  private Instant createdAt = Instant.now();

  protected CommonCodeGroup() {
  }

  public CommonCodeGroup(Long familyId, String menuKey, String code, String name) {
    this.familyId = familyId;
    this.menuKey = menuKey;
    this.code = code;
    this.name = name;
  }

  public Long getId() {
    return id;
  }

  public Long getFamilyId() {
    return familyId;
  }

  public String getMenuKey() {
    return menuKey;
  }

  public void setMenuKey(String menuKey) {
    this.menuKey = menuKey;
  }

  public String getCode() {
    return code;
  }

  public void setCode(String code) {
    this.code = code;
  }

  public String getName() {
    return name;
  }

  public void setName(String name) {
    this.name = name;
  }

  public boolean isActive() {
    return active;
  }

  public void setActive(boolean active) {
    this.active = active;
  }

  public Instant getCreatedAt() {
    return createdAt;
  }
}
