param(
  [string]$Domain = "https://family.example.com",
  [string]$AppDomain = "family.example.com",
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
APP_AUTH_EMAIL_VERIFICATION_REQUIRED=true
APP_MAIL_DAILY_LIMIT_PER_IDENTIFIER=3
APP_BREVO_API_KEY=
APP_MAIL_FROM_EMAIL=
APP_MAIL_FROM_NAME=Family Platform
APP_SMTP_HOST=
APP_SMTP_PORT=587
APP_SMTP_USERNAME=
APP_SMTP_PASSWORD=
APP_SMTP_FROM=
APP_MEDIA_MAX_FILE_SIZE=30MB
APP_MEDIA_MAX_REQUEST_SIZE=40MB
APP_MEDIA_MAX_FILES_PER_POST=6
APP_MEDIA_MAX_REFERENCE_LENGTH=2048
APP_MEDIA_MAX_IMAGE_SIZE=8MB
APP_MEDIA_MAX_VIDEO_SIZE=30MB
APP_MEDIA_STORAGE_DRIVER=local
APP_MEDIA_STORAGE_PATH=/app/uploads
APP_MEDIA_PUBLIC_URL_PREFIX=/api/media/files
APP_MEDIA_S3_ENDPOINT=
APP_MEDIA_S3_REGION=auto
APP_MEDIA_S3_BUCKET=
APP_MEDIA_S3_ACCESS_KEY_ID=
APP_MEDIA_S3_SECRET_ACCESS_KEY=

VITE_API_BASE_URL=/api
WEB_PORT=$WebPort
APP_DOMAIN=$AppDomain
"@ | Set-Content -Path ".env.production" -Encoding UTF8

Write-Host ".env.production created."
Write-Host "Review APP_CORS_ALLOWED_ORIGINS and WEB_PORT before deployment."
