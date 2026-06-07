package com.familyplatform.api.security;

import java.util.Arrays;
import org.springframework.beans.factory.InitializingBean;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

@Component
public class SecurityPropertiesValidator implements InitializingBean {
  static final String DEFAULT_DEV_SECRET = "change-this-dev-secret-before-production";

  private final Environment environment;
  private final String tokenSecret;

  public SecurityPropertiesValidator(Environment environment,
      @Value("${app.security.token-secret}") String tokenSecret) {
    this.environment = environment;
    this.tokenSecret = tokenSecret;
  }

  @Override
  public void afterPropertiesSet() {
    if (!isProductionProfile()) {
      return;
    }
    if (tokenSecret == null || tokenSecret.length() < 48 || DEFAULT_DEV_SECRET.equals(tokenSecret)) {
      throw new IllegalStateException(
          "APP_SECURITY_TOKEN_SECRET must be changed to a strong production secret");
    }
  }

  private boolean isProductionProfile() {
    return Arrays.stream(environment.getActiveProfiles())
        .anyMatch(profile -> profile.equalsIgnoreCase("prod") || profile.equalsIgnoreCase("production"));
  }
}
