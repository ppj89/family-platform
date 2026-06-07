#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Usage: scripts/rollback-prod-https.sh <git-ref>" >&2
  echo "Example: scripts/rollback-prod-https.sh HEAD~1" >&2
  exit 1
fi

TARGET_REF="$1"
ENV_FILE="${ENV_FILE:-.env.production}"
HEALTH_BASE_URL="${HEALTH_BASE_URL:-http://127.0.0.1}"
CURRENT_REF="$(git rev-parse --abbrev-ref HEAD)"
CURRENT_COMMIT="$(git rev-parse --short HEAD)"

if [ ! -f "$ENV_FILE" ]; then
  echo "$ENV_FILE is missing. Run scripts/init-prod-env.sh first." >&2
  exit 1
fi

git fetch --all --prune
git rev-parse --verify "$TARGET_REF^{commit}" >/dev/null

echo "Current ref: $CURRENT_REF ($CURRENT_COMMIT)"
echo "Rollback target: $TARGET_REF ($(git rev-parse --short "$TARGET_REF"))"

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

git checkout --detach "$TARGET_REF"

scripts/deploy-prod-https.sh

for i in $(seq 1 40); do
  if curl -fsS "$HEALTH_BASE_URL/health" >/dev/null && curl -fsS "$HEALTH_BASE_URL/api/health" >/dev/null; then
    echo "Rollback deployment is healthy at $HEALTH_BASE_URL"
    echo "To return to the previous branch later, run: git checkout $CURRENT_REF"
    exit 0
  fi
  sleep 3
done

echo "Rollback deployed, but health checks did not pass." >&2
docker compose -f docker-compose.prod.yml -f docker-compose.https.yml --env-file "$ENV_FILE" ps >&2
exit 1
