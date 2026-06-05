package com.familyplatform.api.baby;

import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;

@Entity
@Table(name = "baby_profiles")
public class BabyProfile {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  private Long familyId;
  private String name;
  private String gender;
  private LocalDate birthDate;
  private String memo;
  private String photoUrl;
  private BigDecimal latestHeightCm;
  private BigDecimal latestWeightKg;
  private Instant createdAt = Instant.now();

  protected BabyProfile() {
  }

  public Long getId() {
    return id;
  }

  public Long getFamilyId() {
    return familyId;
  }

  public void setFamilyId(Long familyId) {
    this.familyId = familyId;
  }

  public String getName() {
    return name;
  }

  public void setName(String name) {
    this.name = name;
  }

  public String getGender() {
    return gender;
  }

  public void setGender(String gender) {
    this.gender = gender;
  }

  public LocalDate getBirthDate() {
    return birthDate;
  }

  public void setBirthDate(LocalDate birthDate) {
    this.birthDate = birthDate;
  }

  public String getMemo() {
    return memo;
  }

  public void setMemo(String memo) {
    this.memo = memo;
  }

  public String getPhotoUrl() {
    return photoUrl;
  }

  public void setPhotoUrl(String photoUrl) {
    this.photoUrl = photoUrl;
  }

  public BigDecimal getLatestHeightCm() {
    return latestHeightCm;
  }

  public void setLatestHeightCm(BigDecimal latestHeightCm) {
    this.latestHeightCm = latestHeightCm;
  }

  public BigDecimal getLatestWeightKg() {
    return latestWeightKg;
  }

  public void setLatestWeightKg(BigDecimal latestWeightKg) {
    this.latestWeightKg = latestWeightKg;
  }

  public Instant getCreatedAt() {
    return createdAt;
  }
}
