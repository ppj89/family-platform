@echo off
set "ROOT=%~dp0.."
set "JAVA_HOME=%ROOT%\.tools\jdk-25\jdk-25.0.3+9"
set "MAVEN_HOME=%ROOT%\.tools\maven\apache-maven-3.9.16"
set "PATH=%JAVA_HOME%\bin;%MAVEN_HOME%\bin;%PATH%"
echo JAVA_HOME=%JAVA_HOME%
java -version
mvn -version
