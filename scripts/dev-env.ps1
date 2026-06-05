$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$env:JAVA_HOME = Join-Path $root ".tools\jdk-25\jdk-25.0.3+9"
$env:MAVEN_HOME = Join-Path $root ".tools\maven\apache-maven-3.9.16"
$env:Path = "$env:JAVA_HOME\bin;$env:MAVEN_HOME\bin;$env:Path"

Write-Host "JAVA_HOME=$env:JAVA_HOME"
java -version
mvn -version
