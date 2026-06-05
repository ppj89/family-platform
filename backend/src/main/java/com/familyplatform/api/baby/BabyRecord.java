package com.familyplatform.api.baby;

import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "baby_records")
public class BabyRecord {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  private Long babyId;
  private String recordType;
  private LocalDate recordDate;
  private String recordTime;
  private Integer amountMl;
  private BigDecimal heightCm;
  private BigDecimal weightKg;
  private String memo;
  private Instant createdAt = Instant.now();

  @ElementCollection(fetch = FetchType.EAGER)
  private List<String> mediaUrls = new ArrayList<>();

  protected BabyRecord() {
  }

  public Long getId() {
    return id;
  }

  public Long getBabyId() {
    return babyId;
  }

  public void setBabyId(Long babyId) {
    this.babyId = babyId;
  }

  public String getRecordType() {
    return recordType;
  }

  public void setRecordType(String recordType) {
    this.recordType = recordType;
  }

  public LocalDate getRecordDate() {
    return recordDate;
  }

  public void setRecordDate(LocalDate recordDate) {
    this.recordDate = recordDate;
  }

  public String getRecordTime() {
    return recordTime;
  }

  public void setRecordTime(String recordTime) {
    this.recordTime = recordTime;
  }

  public Integer getAmountMl() {
    return amountMl;
  }

  public void setAmountMl(Integer amountMl) {
    this.amountMl = amountMl;
  }

  public BigDecimal getHeightCm() {
    return heightCm;
  }

  public void setHeightCm(BigDecimal heightCm) {
    this.heightCm = heightCm;
  }

  public BigDecimal getWeightKg() {
    return weightKg;
  }

  public void setWeightKg(BigDecimal weightKg) {
    this.weightKg = weightKg;
  }

  public String getMemo() {
    return memo;
  }

  public void setMemo(String memo) {
    this.memo = memo;
  }

  public Instant getCreatedAt() {
    return createdAt;
  }

  public List<String> getMediaUrls() {
    return mediaUrls;
  }

  public void setMediaUrls(List<String> mediaUrls) {
    this.mediaUrls = mediaUrls == null ? new ArrayList<>() : mediaUrls;
  }
}
