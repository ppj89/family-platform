package com.familyplatform.api.config;

import java.util.Arrays;
import javax.sql.DataSource;
import org.flywaydb.core.Flyway;
import org.springframework.beans.BeansException;
import org.springframework.beans.factory.config.BeanDefinition;
import org.springframework.beans.factory.config.BeanFactoryPostProcessor;
import org.springframework.beans.factory.config.ConfigurableListableBeanFactory;
import org.springframework.beans.factory.support.BeanDefinitionRegistry;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
@ConditionalOnProperty(prefix = "spring.flyway", name = "enabled", havingValue = "true", matchIfMissing = true)
public class FlywayConfig {
  private static final String FLYWAY_BEAN_NAME = "flyway";

  @Bean(name = FLYWAY_BEAN_NAME, initMethod = "migrate")
  Flyway flyway(DataSource dataSource) {
    return Flyway.configure()
      .dataSource(dataSource)
      .locations("classpath:db/migration")
      .baselineOnMigrate(true)
      .baselineVersion("1")
      .load();
  }

  @Bean
  static BeanFactoryPostProcessor entityManagerDependsOnFlyway() {
    return new BeanFactoryPostProcessor() {
      @Override
      public void postProcessBeanFactory(ConfigurableListableBeanFactory beanFactory) throws BeansException {
        if (!(beanFactory instanceof BeanDefinitionRegistry registry)) {
          return;
        }

        for (String beanName : registry.getBeanDefinitionNames()) {
          if (!beanName.equals("entityManagerFactory") && !beanName.endsWith("EntityManagerFactory")) {
            continue;
          }

          BeanDefinition beanDefinition = registry.getBeanDefinition(beanName);
          String[] dependsOn = beanDefinition.getDependsOn();
          if (dependsOn == null) {
            beanDefinition.setDependsOn(FLYWAY_BEAN_NAME);
            continue;
          }

          if (Arrays.stream(dependsOn).noneMatch(FLYWAY_BEAN_NAME::equals)) {
            String[] updated = Arrays.copyOf(dependsOn, dependsOn.length + 1);
            updated[updated.length - 1] = FLYWAY_BEAN_NAME;
            beanDefinition.setDependsOn(updated);
          }
        }
      }
    };
  }
}
