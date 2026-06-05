. "$PSScriptRoot\dev-env.ps1"
mvn -f "$PSScriptRoot\..\backend\pom.xml" spring-boot:run "-Dspring-boot.run.profiles=local"
