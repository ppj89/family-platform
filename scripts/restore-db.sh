#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Usage: scripts/restore-db.sh <backup.dump>" >&2
  exit 1
fi

BACKUP_PATH="$1"
if [ ! -f "$BACKUP_PATH" ]; then
  echo "Backup file not found: $BACKUP_PATH" >&2
  exit 1
fi

CONTAINER="${DB_CONTAINER:-family-platform-db}"
DATABASE="${POSTGRES_DB:-family_platform}"
USERNAME="${POSTGRES_USER:-family_app}"

docker exec -i "$CONTAINER" pg_restore -U "$USERNAME" -d "$DATABASE" --clean --if-exists --no-owner < "$BACKUP_PATH"

echo "Database restore completed."
