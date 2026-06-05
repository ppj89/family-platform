package com.familyplatform.api.user;

import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import java.time.Instant;

@Entity
@Table(name = "app_users", uniqueConstraints = {
    @UniqueConstraint(name = "uk_app_users_email", columnNames = "email")
})
public class AppUser {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  private String email;
  private String nickname;
  private String passwordHash;
  private String provider;
  private String providerUserId;
  private boolean platformAdmin;
  private Integer failedLoginAttempts = 0;
  private Instant lockedUntil;
  private String activeSessionId;
  private Instant createdAt = Instant.now();

  protected AppUser() {
  }

  public AppUser(String email, String nickname, String provider, String providerUserId, boolean platformAdmin) {
    this.email = email;
    this.nickname = nickname;
    this.provider = provider;
    this.providerUserId = providerUserId;
    this.platformAdmin = platformAdmin;
  }

  public AppUser(String email, String nickname, String passwordHash) {
    this.email = email;
    this.nickname = nickname;
    this.passwordHash = passwordHash;
    this.provider = "local";
  }

  public Long getId() {
    return id;
  }

  public String getEmail() {
    return email;
  }

  public void setEmail(String email) {
    this.email = email;
  }

  public String getNickname() {
    return nickname;
  }

  public void setNickname(String nickname) {
    this.nickname = nickname;
  }

  public String getPasswordHash() {
    return passwordHash;
  }

  public void setPasswordHash(String passwordHash) {
    this.passwordHash = passwordHash;
  }

  public String getProvider() {
    return provider;
  }

  public void setProvider(String provider) {
    this.provider = provider;
  }

  public String getProviderUserId() {
    return providerUserId;
  }

  public void setProviderUserId(String providerUserId) {
    this.providerUserId = providerUserId;
  }

  public boolean isPlatformAdmin() {
    return platformAdmin;
  }

  public void setPlatformAdmin(boolean platformAdmin) {
    this.platformAdmin = platformAdmin;
  }

  public Instant getCreatedAt() {
    return createdAt;
  }

  public int getFailedLoginAttempts() {
    return failedLoginAttempts == null ? 0 : failedLoginAttempts;
  }

  public void setFailedLoginAttempts(int failedLoginAttempts) {
    this.failedLoginAttempts = failedLoginAttempts;
  }

  public Instant getLockedUntil() {
    return lockedUntil;
  }

  public void setLockedUntil(Instant lockedUntil) {
    this.lockedUntil = lockedUntil;
  }

  public String getActiveSessionId() {
    return activeSessionId;
  }

  public void setActiveSessionId(String activeSessionId) {
    this.activeSessionId = activeSessionId;
  }
}
