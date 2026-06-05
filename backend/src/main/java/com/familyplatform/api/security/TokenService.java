package com.familyplatform.api.security;

import com.familyplatform.api.user.AppUser;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
public class TokenService {
  private final byte[] secret;
  private final long validitySeconds;

  public TokenService(@Value("${app.security.token-secret}") String secret,
      @Value("${app.security.token-validity-seconds}") long validitySeconds) {
    if (secret == null || secret.length() < 32) {
      throw new IllegalStateException("app.security.token-secret must be at least 32 characters");
    }
    this.secret = secret.getBytes(StandardCharsets.UTF_8);
    this.validitySeconds = validitySeconds;
  }

  public String issue(AppUser user) {
    String sessionId = user.getActiveSessionId();
    if (sessionId == null || sessionId.isBlank()) {
      throw new IllegalStateException("Active session id is required");
    }
    return issue(user, sessionId);
  }

  public String issue(AppUser user, String sessionId) {
    long expiresAt = Instant.now().plusSeconds(validitySeconds).getEpochSecond();
    String payload = user.getId() + "\n" + user.getEmail() + "\n" + user.isPlatformAdmin() + "\n" + expiresAt + "\n" + sessionId;
    String encodedPayload = encode(payload.getBytes(StandardCharsets.UTF_8));
    return encodedPayload + "." + sign(encodedPayload);
  }

  public AuthenticatedUser verify(String token) {
    if (token == null || token.isBlank()) {
      return null;
    }
    String[] parts = token.split("\\.", 2);
    if (parts.length != 2 || !constantTimeEquals(sign(parts[0]), parts[1])) {
      return null;
    }
    String payload = new String(Base64.getUrlDecoder().decode(parts[0]), StandardCharsets.UTF_8);
    String[] values = payload.split("\n", 5);
    if (values.length != 5 || Long.parseLong(values[3]) < Instant.now().getEpochSecond()) {
      return null;
    }
    return new AuthenticatedUser(Long.parseLong(values[0]), values[1], Boolean.parseBoolean(values[2]), values[4]);
  }

  private String sign(String encodedPayload) {
    try {
      Mac mac = Mac.getInstance("HmacSHA256");
      mac.init(new SecretKeySpec(secret, "HmacSHA256"));
      return encode(mac.doFinal(encodedPayload.getBytes(StandardCharsets.UTF_8)));
    } catch (Exception exception) {
      throw new IllegalStateException("Could not sign token", exception);
    }
  }

  private String encode(byte[] bytes) {
    return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
  }

  private boolean constantTimeEquals(String expected, String actual) {
    if (expected == null || actual == null) {
      return false;
    }
    byte[] expectedBytes = expected.getBytes(StandardCharsets.UTF_8);
    byte[] actualBytes = actual.getBytes(StandardCharsets.UTF_8);
    if (expectedBytes.length != actualBytes.length) {
      return false;
    }
    int diff = 0;
    for (int index = 0; index < expectedBytes.length; index++) {
      diff |= expectedBytes[index] ^ actualBytes[index];
    }
    return diff == 0;
  }
}
