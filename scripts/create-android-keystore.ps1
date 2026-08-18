$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$jdkHome = Join-Path $root ".tools\jdk-21\jdk-21.0.11+10"
$releaseDir = Join-Path $root "android\release"
$keystorePath = Join-Path $releaseDir "family-platform-release.jks"

if (!(Test-Path $jdkHome)) {
  throw "Android build JDK not found: $jdkHome"
}

New-Item -ItemType Directory -Force -Path $releaseDir | Out-Null

if (Test-Path $keystorePath) {
  throw "Keystore already exists: $keystorePath"
}

$storePassword = Read-Host "Keystore password" -AsSecureString
$keyPassword = Read-Host "Key password" -AsSecureString
$storePasswordText = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($storePassword))
$keyPasswordText = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($keyPassword))

& "$jdkHome\bin\keytool.exe" `
  -genkeypair `
  -v `
  -keystore $keystorePath `
  -alias family-platform `
  -keyalg RSA `
  -keysize 4096 `
  -validity 10000 `
  -storepass $storePasswordText `
  -keypass $keyPasswordText `
  -dname "CN=Family Platform, OU=Family Platform, O=Family Platform, L=Seoul, ST=Seoul, C=KR"

Write-Host "Created keystore: $keystorePath"
Write-Host "Copy .env.android-signing.example to .env.android-signing and fill in the passwords."
