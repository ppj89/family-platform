#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat >&2 <<'USAGE'
Usage:
  APP_SMTP_HOST=smtp.gmail.com APP_SMTP_PORT=587 APP_SMTP_USERNAME=... APP_SMTP_PASSWORD=... APP_SMTP_FROM=... scripts/set-prod-smtp.sh

Run this on the production server from /opt/family-platform.
Do not commit SMTP passwords. Pass them only as environment variables.
USAGE
  exit 1
}

smtp_host="${APP_SMTP_HOST:-}"
smtp_port="${APP_SMTP_PORT:-587}"
smtp_username="${APP_SMTP_USERNAME:-}"
smtp_password="${APP_SMTP_PASSWORD:-}"
smtp_from="${APP_SMTP_FROM:-}"
email_verification_required="${APP_AUTH_EMAIL_VERIFICATION_REQUIRED:-false}"
env_file="${ENV_FILE:-.env.production}"

[ -n "$smtp_host" ] || usage
[ -n "$smtp_from" ] || usage
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

cp "$env_file" "$env_file.before-smtp-$(date +%Y%m%d%H%M%S)"
set_env "APP_SMTP_HOST" "$smtp_host"
set_env "APP_SMTP_PORT" "$smtp_port"
set_env "APP_SMTP_USERNAME" "$smtp_username"
set_env "APP_SMTP_PASSWORD" "$smtp_password"
set_env "APP_SMTP_FROM" "$smtp_from"
set_env "APP_AUTH_EMAIL_VERIFICATION_REQUIRED" "$email_verification_required"

docker compose -f docker-compose.prod.yml -f docker-compose.https.yml --env-file "$env_file" up --build -d api caddy web

app_domain="$(grep '^APP_DOMAIN=' "$env_file" | tail -n 1 | cut -d= -f2- | tr -d '\r')"
app_domain="${app_domain:-familyhistory.dedyn.io}"

echo "SMTP credentials applied."
echo "Health:"
curl -fsS "https://$app_domain/api/health" || true
echo
