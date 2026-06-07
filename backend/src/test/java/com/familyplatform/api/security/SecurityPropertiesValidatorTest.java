package com.familyplatform.api.security;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

class SecurityPropertiesValidatorTest {
  @Test
  void allowsDefaultSecretOutsideProductionProfile() {
    MockEnvironment environment = new MockEnvironment();
    SecurityPropertiesValidator validator = new SecurityPropertiesValidator(
        environment,
        SecurityPropertiesValidator.DEFAULT_DEV_SECRET);

    assertThatCode(validator::afterPropertiesSet).doesNotThrowAnyException();
  }

  @Test
  void rejectsDefaultSecretInProductionProfile() {
    MockEnvironment environment = new MockEnvironment().withProperty("spring.profiles.active", "prod");
    environment.setActiveProfiles("prod");
    SecurityPropertiesValidator validator = new SecurityPropertiesValidator(
        environment,
        SecurityPropertiesValidator.DEFAULT_DEV_SECRET);

    assertThatThrownBy(validator::afterPropertiesSet)
        .isInstanceOf(IllegalStateException.class)
        .hasMessageContaining("APP_SECURITY_TOKEN_SECRET");
  }

  @Test
  void acceptsStrongSecretInProductionProfile() {
    MockEnvironment environment = new MockEnvironment();
    environment.setActiveProfiles("production");
    SecurityPropertiesValidator validator = new SecurityPropertiesValidator(
        environment,
        "prod-secret-2026-with-enough-entropy-change-me-through-env-only");

    assertThatCode(validator::afterPropertiesSet).doesNotThrowAnyException();
  }
}
