#!/usr/bin/env bash
set -euo pipefail

PROJECT_NAME="${PROJECT_NAME:-family-platform-prod-smoke}"
WEB_PORT="${WEB_PORT:-18080}"
WEB_BASE_URL="${WEB_BASE_URL:-http://127.0.0.1:${WEB_PORT}}"
ENV_FILE="${ENV_FILE:-}"
KEEP_STACK="${KEEP_STACK:-false}"
PYTHON_BIN="${PYTHON_BIN:-python3}"

created_env=""

for required_bin in curl docker openssl "$PYTHON_BIN"; do
  if ! command -v "$required_bin" >/dev/null 2>&1; then
    echo "$required_bin is required for the production stack smoke test." >&2
    exit 1
  fi
done

cleanup() {
  status=$?
  if [ "$KEEP_STACK" != "true" ]; then
    docker compose -p "$PROJECT_NAME" -f docker-compose.prod.yml --env-file "$ENV_FILE" down -v >/dev/null 2>&1 || true
  fi
  if [ -n "$created_env" ]; then
    rm -f "$created_env"
  fi
  exit "$status"
}

secret() {
  openssl rand -base64 "$1" | tr '+/' '-_' | tr -d '=' | tr -d '\n'
}

if [ -z "$ENV_FILE" ]; then
  created_env="$(mktemp)"
  ENV_FILE="$created_env"
  cat > "$ENV_FILE" <<EOF
POSTGRES_DB=family_platform
POSTGRES_USER=family_app
POSTGRES_PASSWORD=$(secret 36)
APP_CORS_ALLOWED_ORIGINS=$WEB_BASE_URL
APP_SECURITY_TOKEN_SECRET=$(secret 72)
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
APP_DOMAIN=localhost
DB_VOLUME_NAME=${PROJECT_NAME}_db
UPLOADS_VOLUME_NAME=${PROJECT_NAME}_uploads
DB_CONTAINER_NAME=${PROJECT_NAME}-db
API_CONTAINER_NAME=${PROJECT_NAME}-api
WEB_CONTAINER_NAME=${PROJECT_NAME}-web
CADDY_CONTAINER_NAME=${PROJECT_NAME}-caddy
EOF
fi

trap cleanup EXIT

docker compose -p "$PROJECT_NAME" -f docker-compose.prod.yml --env-file "$ENV_FILE" up --build -d

for _ in $(seq 1 60); do
  if curl -fsS "$WEB_BASE_URL/health" >/dev/null 2>&1 && curl -fsS "$WEB_BASE_URL/api/health" >/dev/null 2>&1; then
    API_BASE_URL="$WEB_BASE_URL/api" PYTHON_BIN="$PYTHON_BIN" DB_CONTAINER_NAME="${PROJECT_NAME}-db" sh scripts/test-go-api.sh
    echo "Production stack smoke test passed at $WEB_BASE_URL"
    exit 0
  fi
  sleep 2
done

docker compose -p "$PROJECT_NAME" -f docker-compose.prod.yml --env-file "$ENV_FILE" ps
docker compose -p "$PROJECT_NAME" -f docker-compose.prod.yml --env-file "$ENV_FILE" logs
echo "Production stack smoke test failed: $WEB_BASE_URL did not become healthy." >&2
exit 1
