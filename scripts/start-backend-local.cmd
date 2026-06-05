@echo off
set "ROOT=%~dp0.."
set "JAVA_HOME=%ROOT%\.tools\jdk-25\jdk-25.0.3+9"
set "MAVEN_HOME=%ROOT%\.tools\maven\apache-maven-3.9.16"
set "PATH=%JAVA_HOME%\bin;%MAVEN_HOME%\bin;%PATH%"
mvn -f "%ROOT%\backend\pom.xml" spring-boot:run -Dspring-boot.run.profiles=local
