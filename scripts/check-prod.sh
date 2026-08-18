#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${ENV_FILE:-.env.production}"
BASE_URL="${BASE_URL:-http://127.0.0.1}"
HTTPS="${HTTPS:-false}"
EXPECT_SSO_CONFIGURED="${EXPECT_SSO_CONFIGURED:-false}"
SKIP_COMPOSE="${SKIP_COMPOSE:-false}"

COMPOSE_FILES=(-f docker-compose.prod.yml)
if [ "$HTTPS" = "true" ]; then
  COMPOSE_FILES+=(-f docker-compose.https.yml)
fi

if [ "$SKIP_COMPOSE" != "true" ] && [ ! -f "$ENV_FILE" ]; then
  echo "$ENV_FILE is missing." >&2
  exit 1
fi

if [ "$SKIP_COMPOSE" != "true" ]; then
  echo "Compose services"
  docker compose "${COMPOSE_FILES[@]}" --env-file "$ENV_FILE" ps
  echo
fi

echo "Health checks"
curl -fsS "$BASE_URL/health" >/dev/null
echo "web: ok"
api_health="$(curl -fsS "$BASE_URL/api/health")"
printf '%s' "$api_health" | grep -q '"status":"UP"'
printf '%s' "$api_health" | grep -q '"runtime":"go"'
echo "api: ok"

protected_status="$(curl -sS -o /tmp/family-platform-auth-check.json -w "%{http_code}" "$BASE_URL/api/families")"
if [ "$protected_status" != "401" ]; then
  echo "Expected /api/families to require authentication, got HTTP $protected_status" >&2
  cat /tmp/family-platform-auth-check.json >&2 || true
  exit 1
fi
echo "auth gate: ok"

oauth_providers="$(curl -fsS "$BASE_URL/api/auth/oauth/providers")"
for provider in naver google kakao; do
  printf '%s' "$oauth_providers" | grep -q "\"provider\":\"$provider\""
done
if [ "$EXPECT_SSO_CONFIGURED" = "true" ]; then
  if printf '%s' "$oauth_providers" | grep -q '"configured":false'; then
    echo "Expected all SSO providers to be configured, but at least one is false: $oauth_providers" >&2
    exit 1
  fi
  echo "sso providers: configured"
else
  echo "sso providers: reachable"
fi

headers="$(curl -fsSI "$BASE_URL/")"
printf '%s' "$headers" | grep -qi '^x-content-type-options: nosniff'
printf '%s' "$headers" | grep -qi '^x-frame-options: DENY'
printf '%s' "$headers" | grep -qi '^referrer-policy: strict-origin-when-cross-origin'
if [ "$HTTPS" = "true" ]; then
  printf '%s' "$headers" | grep -qi '^strict-transport-security:'
fi
echo "security headers: ok"

if curl -fsSI "$BASE_URL/downloads/app-debug.apk" >/dev/null; then
  echo "android debug apk: ok"
else
  echo "android debug apk: skipped ($BASE_URL/downloads/app-debug.apk is not available)"
fi

if [ "$SKIP_COMPOSE" != "true" ]; then
  echo
  echo "Recent container logs"
  LOG_SERVICES=(api web)
  if [ "$HTTPS" = "true" ]; then
    LOG_SERVICES+=(caddy)
  fi
  docker compose "${COMPOSE_FILES[@]}" --env-file "$ENV_FILE" logs --tail=40 "${LOG_SERVICES[@]}"
fi

echo
echo "Production check passed at $BASE_URL"
