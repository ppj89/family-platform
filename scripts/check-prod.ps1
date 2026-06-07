$ErrorActionPreference = "Stop"

param(
  [string]$EnvFile = ".env.production",
  [string]$BaseUrl = "http://127.0.0.1"
)

if (!(Test-Path $EnvFile)) {
  throw "$EnvFile is missing."
}

Write-Host "Compose services"
docker compose -f docker-compose.prod.yml -f docker-compose.https.yml --env-file $EnvFile ps

Write-Host ""
Write-Host "Health checks"
Invoke-WebRequest -UseBasicParsing "$BaseUrl/health" | Out-Null
Write-Host "web: ok"
Invoke-WebRequest -UseBasicParsing "$BaseUrl/api/health" | Out-Null
Write-Host "api: ok"

Write-Host ""
Write-Host "Recent container logs"
docker compose -f docker-compose.prod.yml -f docker-compose.https.yml --env-file $EnvFile logs --tail=40 api web caddy

Write-Host ""
Write-Host "Production check passed at $BaseUrl"
