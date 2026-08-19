#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat >&2 <<'USAGE'
Usage:
  PROVIDER=naver CLIENT_ID=... CLIENT_SECRET=... scripts/set-prod-oauth.sh
  PROVIDER=google CLIENT_ID=... CLIENT_SECRET=... scripts/set-prod-oauth.sh
  PROVIDER=kakao CLIENT_ID=... [CLIENT_SECRET=...] scripts/set-prod-oauth.sh

Run this on the production server from /opt/family-platform.
USAGE
  exit 1
}

provider="${PROVIDER:-}"
client_id="${CLIENT_ID:-}"
client_secret="${CLIENT_SECRET:-}"
env_file="${ENV_FILE:-.env.production}"

[ -n "$provider" ] || usage
[ -n "$client_id" ] || usage
[ -f "$env_file" ] || { echo "$env_file is missing." >&2; exit 1; }

case "$provider" in
  google) prefix="APP_OAUTH_GOOGLE" ;;
  naver) prefix="APP_OAUTH_NAVER" ;;
  kakao) prefix="APP_OAUTH_KAKAO" ;;
  *) echo "Unsupported provider: $provider" >&2; usage ;;
esac

if [ "$provider" != "kakao" ] && [ -z "$client_secret" ]; then
  usage
fi

set_env() {
  key="$1"
  value="$2"
  escaped="$(printf '%s' "$value" | sed 's/[\/&]/\\&/g')"
  if grep -q "^$key=" "$env_file"; then
    sed -i "s/^$key=.*/$key=$escaped/" "$env_file"
  else
    printf '%s=%s\n' "$key" "$value" >> "$env_file"
  fi
}

cp "$env_file" "$env_file.before-oauth-$(date +%Y%m%d%H%M%S)"
set_env "${prefix}_CLIENT_ID" "$client_id"
set_env "${prefix}_CLIENT_SECRET" "$client_secret"

docker compose -f docker-compose.prod.yml -f docker-compose.https.yml --env-file "$env_file" up --build -d api caddy web

app_domain="$(grep '^APP_DOMAIN=' "$env_file" | tail -n 1 | cut -d= -f2- | tr -d '\r')"
app_domain="${app_domain:-familyhistory.dedyn.io}"

echo "$provider OAuth credentials applied."
echo "Provider status:"
curl -fsS "https://$app_domain/api/auth/oauth/providers" || true
echo
