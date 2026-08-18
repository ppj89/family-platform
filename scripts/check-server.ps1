param(
  [string]$ServerHost = "192.145.44.103",
  [string]$SshUser = "root",
  [string]$SshKeyPath = "$env:USERPROFILE\.ssh\family_platform_netcup_ed25519",
  [string]$AppDir = "/opt/family-platform",
  [string]$PublicBaseUrl = "http://192.145.44.103",
  [switch]$Https
)

$ErrorActionPreference = "Stop"

function Invoke-Step {
  param(
    [string]$Name,
    [scriptblock]$Body
  )

  Write-Host ""
  Write-Host "== $Name =="
  & $Body
}

if (!(Test-Path $SshKeyPath)) {
  throw "SSH key is missing: $SshKeyPath"
}

$sshTarget = "$SshUser@$ServerHost"
$httpsValue = if ($Https) { "true" } else { "false" }

Invoke-Step "Public health" {
  Invoke-WebRequest -UseBasicParsing "$PublicBaseUrl/health" | Out-Null
  Write-Host "web: ok"
  Invoke-WebRequest -UseBasicParsing "$PublicBaseUrl/api/health" | Out-Null
  Write-Host "api: ok"
}

Invoke-Step "Android APK download" {
  $apkUrl = "$PublicBaseUrl/downloads/app-debug.apk"
  $response = Invoke-WebRequest -UseBasicParsing -Method Head $apkUrl
  $length = $response.Headers["Content-Length"]
  Write-Host "apk: ok ($apkUrl)"
  if ($length) {
    Write-Host "size: $length bytes"
  }
}

Invoke-Step "Remote production check" {
  ssh -i $SshKeyPath -o BatchMode=yes $sshTarget "cd $AppDir && HTTPS=$httpsValue BASE_URL=http://127.0.0.1 scripts/check-prod.sh"
}

Invoke-Step "Remote resources" {
  ssh -i $SshKeyPath -o BatchMode=yes $sshTarget "free -h && df -h / && docker system df"
}

Write-Host ""
Write-Host "Server check passed: $PublicBaseUrl"
