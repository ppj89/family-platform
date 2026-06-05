$ErrorActionPreference = "Stop"

if (!(Test-Path ".env.production")) {
  throw ".env.production is missing. Run scripts\init-prod-env.ps1 first."
}

$envContent = Get-Content ".env.production"
if (!($envContent | Where-Object { $_ -match "^APP_DOMAIN=" })) {
  throw "APP_DOMAIN is missing in .env.production. Add APP_DOMAIN=your-domain.com before HTTPS deployment."
}

docker compose `
  -f docker-compose.prod.yml `
  -f docker-compose.https.yml `
  --env-file .env.production `
  up --build -d

docker compose `
  -f docker-compose.prod.yml `
  -f docker-compose.https.yml `
  --env-file .env.production `
  ps
