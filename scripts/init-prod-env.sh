#!/usr/bin/env sh
set -eu

DOMAIN="${1:-https://family.example.com}"
APP_DOMAIN="${2:-family.example.com}"
WEB_PORT="${3:-80}"

if [ -f .env.production ]; then
  echo ".env.production already exists. Move or delete it before generating a new one." >&2
  exit 1
fi

secret() {
  openssl rand -base64 "$1" | tr '+/' '-_' | tr -d '=' | tr -d '\n'
}

DB_PASSWORD="$(secret 36)"
TOKEN_SECRET="$(secret 72)"

cat > .env.production <<EOF
POSTGRES_DB=family_platform
POSTGRES_USER=family_app
POSTGRES_PASSWORD=$DB_PASSWORD

APP_CORS_ALLOWED_ORIGINS=$DOMAIN
APP_SECURITY_TOKEN_SECRET=$TOKEN_SECRET
APP_SECURITY_TOKEN_VALIDITY_SECONDS=86400
APP_MEDIA_MAX_FILE_SIZE=30MB
APP_MEDIA_MAX_REQUEST_SIZE=40MB
APP_MEDIA_MAX_FILES_PER_POST=6
APP_MEDIA_MAX_REFERENCE_LENGTH=2048
APP_MEDIA_MAX_IMAGE_SIZE=8MB
APP_MEDIA_MAX_VIDEO_SIZE=30MB
APP_MEDIA_STORAGE_PATH=/app/uploads
APP_MEDIA_PUBLIC_URL_PREFIX=/api/media/files

VITE_API_BASE_URL=/api
WEB_PORT=$WEB_PORT
APP_DOMAIN=$APP_DOMAIN
EOF

echo ".env.production created."
echo "Review APP_CORS_ALLOWED_ORIGINS and WEB_PORT before deployment."
