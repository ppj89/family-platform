param(
  [string]$Domain = "https://family.example.com",
  [string]$WebPort = "80"
)

$ErrorActionPreference = "Stop"

if (Test-Path ".env.production") {
  throw ".env.production already exists. Move or delete it before generating a new one."
}

function New-Secret([int]$Bytes = 48) {
  $buffer = [byte[]]::new($Bytes)
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $rng.GetBytes($buffer)
  } finally {
    $rng.Dispose()
  }
  return [Convert]::ToBase64String($buffer).TrimEnd("=").Replace("+", "-").Replace("/", "_")
}

$dbPassword = New-Secret 36
$tokenSecret = New-Secret 72

@"
POSTGRES_DB=family_platform
POSTGRES_USER=family_app
POSTGRES_PASSWORD=$dbPassword

APP_CORS_ALLOWED_ORIGINS=$Domain
APP_SECURITY_TOKEN_SECRET=$tokenSecret
APP_SECURITY_TOKEN_VALIDITY_SECONDS=86400

VITE_API_BASE_URL=/api
WEB_PORT=$WebPort
"@ | Set-Content -Path ".env.production" -Encoding UTF8

Write-Host ".env.production created."
Write-Host "Review APP_CORS_ALLOWED_ORIGINS and WEB_PORT before deployment."
