package com.familyplatform.api.config;

import com.familyplatform.api.family.FamilyGroup;
import com.familyplatform.api.family.FamilyGroupRepository;
import com.familyplatform.api.family.FamilyMember;
import com.familyplatform.api.family.FamilyMemberRepository;
import com.familyplatform.api.user.AppUser;
import com.familyplatform.api.user.AppUserRepository;
import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.crypto.password.PasswordEncoder;

@Configuration
@ConditionalOnProperty(name = "app.seed-default-account", havingValue = "true")
public class DefaultAccountSeeder {
  private static final String DEFAULT_EMAIL = "admin@family.test";
  private static final String DEFAULT_PASSWORD = "family1234";

  @Bean
  CommandLineRunner seedDefaultAccount(AppUserRepository users, FamilyGroupRepository families,
      FamilyMemberRepository members, PasswordEncoder passwordEncoder) {
    return args -> {
      AppUser user = users.findByEmail(DEFAULT_EMAIL)
          .orElseGet(() -> users.save(new AppUser(DEFAULT_EMAIL, "Platform Admin",
              passwordEncoder.encode(DEFAULT_PASSWORD))));

      if (!user.isPlatformAdmin()) {
        user.setPlatformAdmin(true);
        users.save(user);
      }

      if (members.findByUserIdOrderByJoinedAtAsc(user.getId()).isEmpty()) {
        FamilyGroup family = families.save(new FamilyGroup("Admin Family"));
        members.save(new FamilyMember(family.getId(), user.getId(), "PLATFORM_ADMIN", true));
      }
    };
  }
}
