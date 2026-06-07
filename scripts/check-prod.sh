#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${ENV_FILE:-.env.production}"
BASE_URL="${BASE_URL:-http://127.0.0.1}"

if [ ! -f "$ENV_FILE" ]; then
  echo "$ENV_FILE is missing." >&2
  exit 1
fi

echo "Compose services"
docker compose -f docker-compose.prod.yml -f docker-compose.https.yml --env-file "$ENV_FILE" ps

echo
echo "Health checks"
curl -fsS "$BASE_URL/health" >/dev/null
echo "web: ok"
curl -fsS "$BASE_URL/api/health" >/dev/null
echo "api: ok"

echo
echo "Recent container logs"
docker compose -f docker-compose.prod.yml -f docker-compose.https.yml --env-file "$ENV_FILE" logs --tail=40 api web caddy

echo
echo "Production check passed at $BASE_URL"
