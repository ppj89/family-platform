package com.familyplatform.api.auth;

import com.familyplatform.api.auth.dto.AuthRequest;
import com.familyplatform.api.auth.dto.AuthResponse;
import com.familyplatform.api.auth.dto.RegisterRequest;
import com.familyplatform.api.family.FamilyGroup;
import com.familyplatform.api.family.FamilyGroupRepository;
import com.familyplatform.api.family.FamilyMember;
import com.familyplatform.api.family.FamilyMemberRepository;
import com.familyplatform.api.security.AuthenticatedUser;
import com.familyplatform.api.security.TokenService;
import com.familyplatform.api.user.AppUser;
import com.familyplatform.api.user.AppUserRepository;
import jakarta.validation.Valid;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Locale;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
  private static final int MAX_FAILED_ATTEMPTS = 5;
  private static final long LOCK_MINUTES = 5;

  private final AppUserRepository users;
  private final FamilyGroupRepository families;
  private final FamilyMemberRepository familyMembers;
  private final PasswordEncoder passwordEncoder;
  private final TokenService tokens;

  public AuthController(AppUserRepository users, FamilyGroupRepository families, FamilyMemberRepository familyMembers,
      PasswordEncoder passwordEncoder, TokenService tokens) {
    this.users = users;
    this.families = families;
    this.familyMembers = familyMembers;
    this.passwordEncoder = passwordEncoder;
    this.tokens = tokens;
  }

  @PostMapping("/register")
  @ResponseStatus(HttpStatus.CREATED)
  public AuthResponse register(@Valid @RequestBody RegisterRequest request) {
    String email = normalizeEmail(request.email());
    if (users.existsByEmail(email)) {
      throw new ResponseStatusException(HttpStatus.CONFLICT, "Email is already registered");
    }
    boolean firstUser = users.count() == 0;
    AppUser user = new AppUser(email, request.nickname().trim(), passwordEncoder.encode(request.password()));
    user.setPlatformAdmin(firstUser);
    user.setActiveSessionId(newSessionId());
    user = users.save(user);
    FamilyGroup family = families.save(new FamilyGroup(request.nickname().trim() + " 가족"));
    FamilyMember member = new FamilyMember(family.getId(), user.getId(), "FAMILY_ADMIN", true);
    member.setCanRead(true);
    familyMembers.save(member);
    return response(user);
  }

  @PostMapping("/login")
  public AuthResponse login(@Valid @RequestBody AuthRequest request) {
    String email = normalizeEmail(request.email());
    AppUser user = users.findByEmail(email)
        .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid email or password"));
    ensureNotLocked(user);
    if (user.getPasswordHash() == null || !passwordEncoder.matches(request.password(), user.getPasswordHash())) {
      recordFailedLogin(user);
      throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid email or password");
    }
    if (hasActiveSession(user) && !request.isForceLogin()) {
      throw new ResponseStatusException(HttpStatus.CONFLICT, "Active session exists");
    }
    user.setFailedLoginAttempts(0);
    user.setLockedUntil(null);
    user.setActiveSessionId(newSessionId());
    user = users.save(user);
    return response(user);
  }

  @GetMapping("/me")
  public AuthResponse me() {
    Object principal = SecurityContextHolder.getContext().getAuthentication().getPrincipal();
    if (!(principal instanceof AuthenticatedUser authenticatedUser)) {
      throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Authentication required");
    }
    AppUser user = users.findById(authenticatedUser.id())
        .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid session"));
    return new AuthResponse(tokens.issue(user, authenticatedUser.sessionId()), user.getId(), user.getEmail(),
        user.getNickname(), user.isPlatformAdmin());
  }

  private AuthResponse response(AppUser user) {
    return new AuthResponse(tokens.issue(user), user.getId(), user.getEmail(), user.getNickname(), user.isPlatformAdmin());
  }

  private void ensureNotLocked(AppUser user) {
    Instant lockedUntil = user.getLockedUntil();
    if (lockedUntil != null && lockedUntil.isAfter(Instant.now())) {
      long seconds = Math.max(1, ChronoUnit.SECONDS.between(Instant.now(), lockedUntil));
      throw new ResponseStatusException(HttpStatus.LOCKED,
          "Account is locked. Try again in " + seconds + " seconds");
    }
    if (lockedUntil != null) {
      user.setLockedUntil(null);
      user.setFailedLoginAttempts(0);
      users.save(user);
    }
  }

  private void recordFailedLogin(AppUser user) {
    int attempts = user.getFailedLoginAttempts() + 1;
    user.setFailedLoginAttempts(attempts);
    if (attempts >= MAX_FAILED_ATTEMPTS) {
      user.setLockedUntil(Instant.now().plus(LOCK_MINUTES, ChronoUnit.MINUTES));
    }
    users.save(user);
  }

  private boolean hasActiveSession(AppUser user) {
    String sessionId = user.getActiveSessionId();
    return sessionId != null && !sessionId.isBlank();
  }

  private String newSessionId() {
    return UUID.randomUUID().toString();
  }

  private String normalizeEmail(String email) {
    return email.trim().toLowerCase(Locale.ROOT);
  }
}
