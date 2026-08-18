$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$jdkHome = Join-Path $root ".tools\jdk-21\jdk-21.0.11+10"
$androidSdk = Join-Path $root ".tools\android-sdk"

if (!(Test-Path $jdkHome)) {
  throw "Android build JDK not found: $jdkHome"
}

if (!(Test-Path $androidSdk)) {
  throw "Android SDK not found: $androidSdk"
}

$env:JAVA_HOME = $jdkHome
$env:ANDROID_HOME = $androidSdk
$env:ANDROID_SDK_ROOT = $androidSdk
$env:PATH = "$jdkHome\bin;$androidSdk\platform-tools;$env:PATH"

Push-Location $root
try {
  & .\scripts\npm-tools.cmd run cap:android
  Push-Location android
  try {
    & .\gradlew.bat assembleDebug
  } finally {
    Pop-Location
  }
} finally {
  Pop-Location
}

Write-Host "Debug APK: $root\android\app\build\outputs\apk\debug\app-debug.apk"
