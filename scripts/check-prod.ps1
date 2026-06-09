param(
  [string]$EnvFile = ".env.production",
  [string]$BaseUrl = "http://127.0.0.1",
  [switch]$Https,
  [switch]$ExpectSsoConfigured,
  [switch]$SkipCompose
)

$ErrorActionPreference = "Stop"

if (!$SkipCompose -and !(Test-Path $EnvFile)) {
  throw "$EnvFile is missing."
}

$composeArgs = @("-f", "docker-compose.prod.yml")
if ($Https) {
  $composeArgs += @("-f", "docker-compose.https.yml")
}
$composeArgs += @("--env-file", $EnvFile)

if (!$SkipCompose) {
  Write-Host "Compose services"
  docker compose @composeArgs ps
  Write-Host ""
}

Write-Host "Health checks"
Invoke-WebRequest -UseBasicParsing "$BaseUrl/health" | Out-Null
Write-Host "web: ok"
$apiHealth = Invoke-RestMethod -UseBasicParsing "$BaseUrl/api/health"
if ($apiHealth.status -ne "UP" -or $apiHealth.runtime -ne "go") {
  throw "Unexpected API health response: $($apiHealth | ConvertTo-Json -Compress)"
}
Write-Host "api: ok"

$authGateStatus = $null
try {
  $authGateResponse = Invoke-WebRequest -UseBasicParsing "$BaseUrl/api/families"
  $authGateStatus = $authGateResponse.StatusCode
} catch {
  if ($_.Exception.Response) {
    $authGateStatus = $_.Exception.Response.StatusCode.value__
  }
}
if ($authGateStatus -ne 401) {
  throw "Expected /api/families to return 401, got $authGateStatus."
}
Write-Host "auth gate: ok"

$oauthProviders = Invoke-RestMethod -UseBasicParsing "$BaseUrl/api/auth/oauth/providers"
$providerNames = @($oauthProviders | ForEach-Object { $_.provider })
foreach ($provider in @("naver", "google", "kakao")) {
  if ($providerNames -notcontains $provider) {
    throw "Missing SSO provider: $provider"
  }
}
if ($ExpectSsoConfigured) {
  $notConfigured = @($oauthProviders | Where-Object { -not $_.configured })
  if ($notConfigured.Count -gt 0) {
    throw "Expected all SSO providers to be configured: $($oauthProviders | ConvertTo-Json -Compress)"
  }
  Write-Host "sso providers: configured"
} else {
  Write-Host "sso providers: reachable"
}

$headersResponse = Invoke-WebRequest -UseBasicParsing -Method Head "$BaseUrl/"
$contentTypeOptions = [string]$headersResponse.Headers["X-Content-Type-Options"]
$frameOptions = [string]$headersResponse.Headers["X-Frame-Options"]
$referrerPolicy = [string]$headersResponse.Headers["Referrer-Policy"]
$hsts = [string]$headersResponse.Headers["Strict-Transport-Security"]
if ($contentTypeOptions -notmatch "(^|,)\s*nosniff\s*(,|$)") {
  throw "Missing X-Content-Type-Options header."
}
if ($frameOptions -notmatch "(^|,)\s*DENY\s*(,|$)") {
  throw "Missing X-Frame-Options header."
}
if ($referrerPolicy -notmatch "(^|,)\s*strict-origin-when-cross-origin\s*(,|$)") {
  throw "Missing Referrer-Policy header."
}
if ($Https -and !$hsts) {
  throw "Missing Strict-Transport-Security header."
}
Write-Host "security headers: ok"

$downloadUrl = "$BaseUrl/downloads/app-debug.apk"
try {
  $downloadResponse = Invoke-WebRequest -UseBasicParsing -Method Head $downloadUrl
  if ($downloadResponse.StatusCode -ge 200 -and $downloadResponse.StatusCode -lt 400) {
    Write-Host "android debug apk: ok"
  }
} catch {
  Write-Host "android debug apk: skipped ($downloadUrl is not available)"
}

if (!$SkipCompose) {
  Write-Host ""
  Write-Host "Recent container logs"
  $logServices = @("api", "web")
  if ($Https) {
    $logServices += "caddy"
  }
  docker compose @composeArgs logs --tail=40 @logServices
}

Write-Host ""
Write-Host "Production check passed at $BaseUrl"
