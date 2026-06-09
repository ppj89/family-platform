#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${ENV_FILE:-.env.production}"
BASE_URL="${BASE_URL:-http://127.0.0.1}"
DISK_WARN_PERCENT="${DISK_WARN_PERCENT:-85}"
ALERT_WEBHOOK_URL="${ALERT_WEBHOOK_URL:-}"
EXPECT_SSO_CONFIGURED="${EXPECT_SSO_CONFIGURED:-false}"

if [ ! -f "$ENV_FILE" ]; then
  echo "$ENV_FILE is missing." >&2
  exit 1
fi

send_alert() {
  message="$1"
  echo "$message" >&2

  if [ -n "$ALERT_WEBHOOK_URL" ]; then
    escaped="$(printf '%s' "$message" | sed 's/\\/\\\\/g; s/"/\\"/g')"
    curl -fsS \
      -H "Content-Type: application/json" \
      -d "{\"text\":\"$escaped\",\"content\":\"$escaped\"}" \
      "$ALERT_WEBHOOK_URL" >/dev/null || true
  fi
}

check_url() {
  name="$1"
  url="$2"

  if ! curl -fsS --max-time 10 "$url" >/dev/null; then
    send_alert "Family Platform monitor failed: $name is unhealthy at $url"
    return 1
  fi
}

check_auth_gate() {
  status="$(curl -sS --max-time 10 -o /tmp/family-platform-monitor-auth.json -w "%{http_code}" "$BASE_URL/api/families" || true)"
  if [ "$status" != "401" ]; then
    send_alert "Family Platform monitor failed: unauthenticated /api/families returned HTTP $status"
    return 1
  fi
}

check_sso_providers() {
  providers="$(curl -fsS --max-time 10 "$BASE_URL/api/auth/oauth/providers" 2>/dev/null || true)"
  if [ -z "$providers" ]; then
    send_alert "Family Platform monitor failed: SSO provider status endpoint is unavailable"
    return 1
  fi
  for provider in naver google kakao; do
    if ! printf '%s' "$providers" | grep -q "\"provider\":\"$provider\""; then
      send_alert "Family Platform monitor failed: SSO provider $provider is missing"
      return 1
    fi
  done
  if [ "$EXPECT_SSO_CONFIGURED" = "true" ] && printf '%s' "$providers" | grep -q '"configured":false'; then
    send_alert "Family Platform monitor failed: at least one SSO provider is not configured"
    return 1
  fi
}

failed=0
check_url "web" "$BASE_URL/health" || failed=1
check_url "api" "$BASE_URL/api/health" || failed=1
check_auth_gate || failed=1
check_sso_providers || failed=1

disk_percent="$(df -P . | awk 'NR == 2 { gsub(/%/, "", $5); print $5 }')"
if [ -n "$disk_percent" ] && [ "$disk_percent" -ge "$DISK_WARN_PERCENT" ]; then
  send_alert "Family Platform monitor warning: disk usage is ${disk_percent}% at $(pwd)"
  failed=1
fi

if [ "$failed" -ne 0 ]; then
  docker compose -f docker-compose.prod.yml -f docker-compose.https.yml --env-file "$ENV_FILE" ps >&2 || true
  exit 1
fi

echo "Production monitor passed at $BASE_URL"
