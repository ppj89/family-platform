$ErrorActionPreference = 'Stop'

if (-not (Test-Path '.env.production')) {
  Write-Error '.env.production is missing. Copy .env.production.example and edit secrets first.'
}

docker compose -f docker-compose.prod.yml --env-file .env.production up --build -d
docker compose -f docker-compose.prod.yml --env-file .env.production ps
