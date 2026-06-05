package com.familyplatform.api;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class FamilyPlatformApiApplication {
  public static void main(String[] args) {
    SpringApplication.run(FamilyPlatformApiApplication.class, args);
  }
}
