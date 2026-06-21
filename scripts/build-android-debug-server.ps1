param(
  [string]$AppUrl = "https://familyhistory.dedyn.io",
  [string]$ApiBaseUrl = "https://familyhistory.dedyn.io/api"
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $repoRoot

$portableNode = Join-Path $repoRoot ".tools\node"
if (Test-Path $portableNode) {
  $env:PATH = "$portableNode;$env:PATH"
}

function Invoke-Checked {
  param(
    [string]$Command,
    [string[]]$Arguments = @()
  )

  & $Command @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$Command failed with exit code $LASTEXITCODE"
  }
}

$env:VITE_API_BASE_URL = $ApiBaseUrl
$env:CAPACITOR_SERVER_URL = $AppUrl
Invoke-Checked "npm.cmd" @("run", "build")
Invoke-Checked "npx.cmd" @("cap", "sync", "android")

Push-Location android
try {
  Invoke-Checked ".\gradlew.bat" @("assembleDebug")
}
finally {
  Pop-Location
}

$apkPath = Join-Path $repoRoot "android\app\build\outputs\apk\debug\app-debug.apk"
Write-Host "Android debug APK created: $apkPath"
