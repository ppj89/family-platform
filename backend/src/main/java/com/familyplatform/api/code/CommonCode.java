package com.familyplatform.api.code;

import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

@Entity
@Table(name = "common_codes")
public class CommonCode {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  private Long groupId;
  private String code;
  private String name;
  private Integer sortOrder;
  private boolean active = true;
  private Instant createdAt = Instant.now();

  protected CommonCode() {
  }

  public CommonCode(Long groupId, String code, String name, Integer sortOrder) {
    this.groupId = groupId;
    this.code = code;
    this.name = name;
    this.sortOrder = sortOrder;
  }

  public Long getId() {
    return id;
  }

  public Long getGroupId() {
    return groupId;
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

  public Integer getSortOrder() {
    return sortOrder;
  }

  public void setSortOrder(Integer sortOrder) {
    this.sortOrder = sortOrder;
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
