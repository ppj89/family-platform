#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${ENV_FILE:-.env.production}"
BASE_URL="${BASE_URL:-http://127.0.0.1}"
HTTPS="${HTTPS:-false}"

COMPOSE_FILES=(-f docker-compose.prod.yml)
if [ "$HTTPS" = "true" ]; then
  COMPOSE_FILES+=(-f docker-compose.https.yml)
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "$ENV_FILE is missing." >&2
  exit 1
fi

echo "Compose services"
docker compose "${COMPOSE_FILES[@]}" --env-file "$ENV_FILE" ps

echo
echo "Health checks"
curl -fsS "$BASE_URL/health" >/dev/null
echo "web: ok"
curl -fsS "$BASE_URL/api/health" >/dev/null
echo "api: ok"
if curl -fsSI "$BASE_URL/downloads/app-debug.apk" >/dev/null; then
  echo "android debug apk: ok"
else
  echo "android debug apk: skipped ($BASE_URL/downloads/app-debug.apk is not available)"
fi

echo
echo "Recent container logs"
LOG_SERVICES=(api web)
if [ "$HTTPS" = "true" ]; then
  LOG_SERVICES+=(caddy)
fi
docker compose "${COMPOSE_FILES[@]}" --env-file "$ENV_FILE" logs --tail=40 "${LOG_SERVICES[@]}"

echo
echo "Production check passed at $BASE_URL"
