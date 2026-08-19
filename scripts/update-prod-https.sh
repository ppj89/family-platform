#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${ENV_FILE:-.env.production}"
HEALTH_BASE_URL="${HEALTH_BASE_URL:-http://127.0.0.1}"

if [ ! -f "$ENV_FILE" ]; then
  echo "$ENV_FILE is missing. Run scripts/init-prod-env.sh first." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

DB_CONTAINER="${DB_CONTAINER:-${DB_CONTAINER_NAME:-family-platform-db}}"
UPLOADS_VOLUME="${UPLOADS_VOLUME:-${UPLOADS_VOLUME_NAME:-family_platform_prod_uploads}}"
export DB_CONTAINER UPLOADS_VOLUME

if [ "${SKIP_BACKUP:-0}" != "1" ]; then
  if docker ps --format '{{.Names}}' | grep -qx "$DB_CONTAINER"; then
    scripts/backup-db.sh
  else
    echo "Database container '$DB_CONTAINER' is not running. Skipping database backup."
  fi

  if docker volume inspect "$UPLOADS_VOLUME" >/dev/null 2>&1; then
    scripts/backup-uploads.sh
  else
    echo "Uploads volume '$UPLOADS_VOLUME' does not exist yet. Skipping uploads backup."
  fi
fi

if [ "${SKIP_GIT_PULL:-0}" != "1" ]; then
  git pull --ff-only
fi

scripts/deploy-prod-https.sh

for i in $(seq 1 40); do
  if curl -fsS "$HEALTH_BASE_URL/health" >/dev/null && curl -fsS "$HEALTH_BASE_URL/api/health" >/dev/null; then
    echo "Production deployment is healthy at $HEALTH_BASE_URL"
    exit 0
  fi
  sleep 3
done

echo "Deployment finished, but health checks did not pass." >&2
docker compose -f docker-compose.prod.yml -f docker-compose.https.yml --env-file "$ENV_FILE" ps >&2
exit 1
