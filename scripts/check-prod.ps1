param(
  [string]$EnvFile = ".env.production",
  [string]$BaseUrl = "http://127.0.0.1",
  [switch]$Https
)

$ErrorActionPreference = "Stop"

if (!(Test-Path $EnvFile)) {
  throw "$EnvFile is missing."
}

$composeArgs = @("-f", "docker-compose.prod.yml")
if ($Https) {
  $composeArgs += @("-f", "docker-compose.https.yml")
}
$composeArgs += @("--env-file", $EnvFile)

Write-Host "Compose services"
docker compose @composeArgs ps

Write-Host ""
Write-Host "Health checks"
Invoke-WebRequest -UseBasicParsing "$BaseUrl/health" | Out-Null
Write-Host "web: ok"
Invoke-WebRequest -UseBasicParsing "$BaseUrl/api/health" | Out-Null
Write-Host "api: ok"

$downloadUrl = "$BaseUrl/downloads/app-debug.apk"
try {
  $downloadResponse = Invoke-WebRequest -UseBasicParsing -Method Head $downloadUrl
  if ($downloadResponse.StatusCode -ge 200 -and $downloadResponse.StatusCode -lt 400) {
    Write-Host "android debug apk: ok"
  }
} catch {
  Write-Host "android debug apk: skipped ($downloadUrl is not available)"
}

Write-Host ""
Write-Host "Recent container logs"
$logServices = @("api", "web")
if ($Https) {
  $logServices += "caddy"
}
docker compose @composeArgs logs --tail=40 @logServices

Write-Host ""
Write-Host "Production check passed at $BaseUrl"
