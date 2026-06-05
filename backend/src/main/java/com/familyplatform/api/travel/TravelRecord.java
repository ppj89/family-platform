package com.familyplatform.api.travel;

import jakarta.persistence.ElementCollection;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "travel_records")
public class TravelRecord {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  private Long tripId;
  private Integer sortOrder;
  private String title;
  private String category;
  private BigDecimal amount = BigDecimal.ZERO;
  private String note;
  private String location;
  private Double latitude;
  private Double longitude;
  private LocalDate recordDate;
  private LocalTime recordTime;
  private Instant createdAt = Instant.now();

  @ElementCollection(fetch = FetchType.EAGER)
  @Column(name = "media_urls", length = 2048)
  private List<String> mediaUrls = new ArrayList<>();

  protected TravelRecord() {
  }

  public Long getId() {
    return id;
  }

  public Long getTripId() {
    return tripId;
  }

  public void setTripId(Long tripId) {
    this.tripId = tripId;
  }

  public Integer getSortOrder() {
    return sortOrder;
  }

  public void setSortOrder(Integer sortOrder) {
    this.sortOrder = sortOrder;
  }

  public String getTitle() {
    return title;
  }

  public void setTitle(String title) {
    this.title = title;
  }

  public String getCategory() {
    return category;
  }

  public void setCategory(String category) {
    this.category = category;
  }

  public BigDecimal getAmount() {
    return amount;
  }

  public void setAmount(BigDecimal amount) {
    this.amount = amount == null ? BigDecimal.ZERO : amount;
  }

  public String getNote() {
    return note;
  }

  public void setNote(String note) {
    this.note = note;
  }

  public String getLocation() {
    return location;
  }

  public void setLocation(String location) {
    this.location = location;
  }

  public Double getLatitude() {
    return latitude;
  }

  public void setLatitude(Double latitude) {
    this.latitude = latitude;
  }

  public Double getLongitude() {
    return longitude;
  }

  public void setLongitude(Double longitude) {
    this.longitude = longitude;
  }

  public LocalDate getRecordDate() {
    return recordDate;
  }

  public void setRecordDate(LocalDate recordDate) {
    this.recordDate = recordDate;
  }

  public LocalTime getRecordTime() {
    return recordTime;
  }

  public void setRecordTime(LocalTime recordTime) {
    this.recordTime = recordTime;
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
