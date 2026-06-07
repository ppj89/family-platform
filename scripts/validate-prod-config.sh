#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${1:-.env.production}"
ALLOW_PLACEHOLDERS="${ALLOW_PLACEHOLDERS:-0}"
SKIP_CADDY_VALIDATE="${SKIP_CADDY_VALIDATE:-0}"

if [ ! -f "$ENV_FILE" ]; then
  echo "$ENV_FILE is missing." >&2
  exit 1
fi

fail() {
  echo "Production config validation failed: $1" >&2
  exit 1
}

require_key() {
  key="$1"
  if ! grep -q "^$key=" "$ENV_FILE"; then
    fail "$key is missing in $ENV_FILE"
  fi
}

value_of() {
  key="$1"
  grep "^$key=" "$ENV_FILE" | tail -n 1 | cut -d= -f2-
}

required_keys="
POSTGRES_DB
POSTGRES_USER
POSTGRES_PASSWORD
APP_CORS_ALLOWED_ORIGINS
APP_SECURITY_TOKEN_SECRET
APP_SECURITY_TOKEN_VALIDITY_SECONDS
APP_MEDIA_MAX_FILES_PER_POST
APP_MEDIA_MAX_IMAGE_SIZE
APP_MEDIA_MAX_VIDEO_SIZE
VITE_API_BASE_URL
WEB_PORT
APP_DOMAIN
"

for key in $required_keys; do
  require_key "$key"
done

db_password="$(value_of POSTGRES_PASSWORD)"
token_secret="$(value_of APP_SECURITY_TOKEN_SECRET)"
cors_origins="$(value_of APP_CORS_ALLOWED_ORIGINS)"
vite_api_base="$(value_of VITE_API_BASE_URL)"
app_domain="$(value_of APP_DOMAIN)"
web_port="$(value_of WEB_PORT)"

if [ "$ALLOW_PLACEHOLDERS" != "1" ]; then
  case "$db_password" in
    change-this*|password|postgres|family_app)
      fail "POSTGRES_PASSWORD still looks like a default value"
      ;;
  esac

  case "$token_secret" in
    change-this*|dev*|secret*|replace*)
      fail "APP_SECURITY_TOKEN_SECRET still looks like a default value"
      ;;
  esac

  case "$cors_origins" in
    *localhost*|*127.0.0.1*|http://*)
      fail "APP_CORS_ALLOWED_ORIGINS must use production HTTPS origins only"
      ;;
  esac

  case "$app_domain" in
    family.example.com|localhost|127.0.0.1|http://*|https://*)
      fail "APP_DOMAIN must be a real hostname without scheme"
      ;;
  esac
fi

if [ "${#token_secret}" -lt 48 ]; then
  fail "APP_SECURITY_TOKEN_SECRET must be at least 48 characters"
fi

case "$vite_api_base" in
  /api|https://*)
    ;;
  *)
    fail "VITE_API_BASE_URL must be /api or an HTTPS URL"
    ;;
esac

case "$web_port" in
  ''|*[!0-9]*)
    fail "WEB_PORT must be numeric"
    ;;
esac

docker compose -f docker-compose.prod.yml --env-file "$ENV_FILE" config --quiet
docker compose -f docker-compose.prod.yml -f docker-compose.https.yml --env-file "$ENV_FILE" config --quiet

if [ "$SKIP_CADDY_VALIDATE" != "1" ] && command -v docker >/dev/null 2>&1; then
  docker run --rm \
    -e APP_DOMAIN="${app_domain:-localhost}" \
    -v "$(pwd)/Caddyfile:/etc/caddy/Caddyfile:ro" \
    caddy:2.10-alpine caddy validate --config /etc/caddy/Caddyfile >/dev/null
fi

echo "Production config validation passed for $ENV_FILE"
