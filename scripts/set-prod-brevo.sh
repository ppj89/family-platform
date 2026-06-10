#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat >&2 <<'USAGE'
Usage:
  APP_BREVO_API_KEY=... APP_MAIL_FROM_EMAIL=sender@example.com [APP_MAIL_FROM_NAME="Family Platform"] scripts/set-prod-brevo.sh

Run this on the production server from /opt/family-platform.
Do not commit Brevo API keys. Pass them only as environment variables.
USAGE
  exit 1
}

brevo_api_key="${APP_BREVO_API_KEY:-}"
mail_from_email="${APP_MAIL_FROM_EMAIL:-}"
mail_from_name="${APP_MAIL_FROM_NAME:-Family Platform}"
mail_daily_limit="${APP_MAIL_DAILY_LIMIT_PER_IDENTIFIER:-3}"
email_verification_required="${APP_AUTH_EMAIL_VERIFICATION_REQUIRED:-false}"
env_file="${ENV_FILE:-.env.production}"

[ -n "$brevo_api_key" ] || usage
[ -n "$mail_from_email" ] || usage
[ -f "$env_file" ] || { echo "$env_file is missing." >&2; exit 1; }

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

cp "$env_file" "$env_file.before-brevo-$(date +%Y%m%d%H%M%S)"
set_env "APP_BREVO_API_KEY" "$brevo_api_key"
set_env "APP_MAIL_FROM_EMAIL" "$mail_from_email"
set_env "APP_MAIL_FROM_NAME" "$mail_from_name"
set_env "APP_MAIL_DAILY_LIMIT_PER_IDENTIFIER" "$mail_daily_limit"
set_env "APP_AUTH_EMAIL_VERIFICATION_REQUIRED" "$email_verification_required"

docker compose -f docker-compose.prod.yml -f docker-compose.https.yml --env-file "$env_file" up --build -d api caddy web

app_domain="$(grep '^APP_DOMAIN=' "$env_file" | tail -n 1 | cut -d= -f2- | tr -d '\r')"
app_domain="${app_domain:-familyhistory.dedyn.io}"

echo "Brevo mail API credentials applied."
echo "Health:"
curl -fsS "https://$app_domain/api/health" || true
echo
