param(
  [string]$AppUrl = "https://familyhistory.dedyn.io",
  [string]$ApiBaseUrl = "https://familyhistory.dedyn.io/api"
)

$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$envFile = Join-Path $root ".env.android-signing"
$jdkHome = Join-Path $root ".tools\jdk-21\jdk-21.0.11+10"
$androidSdk = Join-Path $root ".tools\android-sdk"

if (!(Test-Path $envFile)) {
  throw "Missing .env.android-signing. Copy .env.android-signing.example and fill in release signing values."
}

if (!(Test-Path $jdkHome)) {
  throw "Android build JDK not found: $jdkHome"
}

if (!(Test-Path $androidSdk)) {
  throw "Android SDK not found: $androidSdk"
}

Get-Content $envFile | ForEach-Object {
  if ($_ -match "^\s*#" -or $_ -notmatch "=") {
    return
  }
  $name, $value = $_.Split("=", 2)
  [Environment]::SetEnvironmentVariable($name.Trim(), $value.Trim(), "Process")
}

if ($env:ANDROID_KEYSTORE_PATH -and ![System.IO.Path]::IsPathRooted($env:ANDROID_KEYSTORE_PATH)) {
  $env:ANDROID_KEYSTORE_PATH = Join-Path $root $env:ANDROID_KEYSTORE_PATH
}

$env:JAVA_HOME = $jdkHome
$env:ANDROID_HOME = $androidSdk
$env:ANDROID_SDK_ROOT = $androidSdk
$env:CAPACITOR_SERVER_URL = $AppUrl
$env:VITE_API_BASE_URL = $ApiBaseUrl
$env:PATH = "$jdkHome\bin;$androidSdk\platform-tools;$env:PATH"

Push-Location $root
try {
  & .\scripts\npm-tools.cmd run cap:android
  Push-Location android
  try {
    & .\gradlew.bat bundleRelease
  } finally {
    Pop-Location
  }
} finally {
  Pop-Location
}

Write-Host "Release AAB: $root\android\app\build\outputs\bundle\release\app-release.aab"
