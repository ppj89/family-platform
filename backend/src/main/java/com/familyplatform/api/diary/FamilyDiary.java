package com.familyplatform.api.diary;

import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "family_diaries")
public class FamilyDiary {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  private Long familyId;
  private String title;
  private String body;
  private LocalDate diaryDate;
  private String weather;
  private String mood;
  private Integer minTemperature;
  private Integer maxTemperature;
  private Instant createdAt = Instant.now();

  @ElementCollection(fetch = FetchType.EAGER)
  private List<String> mediaUrls = new ArrayList<>();

  protected FamilyDiary() {
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

  public String getTitle() {
    return title;
  }

  public void setTitle(String title) {
    this.title = title;
  }

  public String getBody() {
    return body;
  }

  public void setBody(String body) {
    this.body = body;
  }

  public LocalDate getDiaryDate() {
    return diaryDate;
  }

  public void setDiaryDate(LocalDate diaryDate) {
    this.diaryDate = diaryDate;
  }

  public String getWeather() {
    return weather;
  }

  public void setWeather(String weather) {
    this.weather = weather;
  }

  public String getMood() {
    return mood;
  }

  public void setMood(String mood) {
    this.mood = mood;
  }

  public Integer getMinTemperature() {
    return minTemperature;
  }

  public void setMinTemperature(Integer minTemperature) {
    this.minTemperature = minTemperature;
  }

  public Integer getMaxTemperature() {
    return maxTemperature;
  }

  public void setMaxTemperature(Integer maxTemperature) {
    this.maxTemperature = maxTemperature;
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
