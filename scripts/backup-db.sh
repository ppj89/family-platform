#!/usr/bin/env bash
set -euo pipefail

CONTAINER="${DB_CONTAINER:-family-platform-db}"
DATABASE="${POSTGRES_DB:-family_platform}"
USERNAME="${POSTGRES_USER:-family_app}"
BACKUP_DIR="${BACKUP_DIR:-backups}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_PATH="$BACKUP_DIR/$DATABASE-$TIMESTAMP.dump"

mkdir -p "$BACKUP_DIR"
docker exec "$CONTAINER" pg_dump -U "$USERNAME" -d "$DATABASE" -Fc > "$BACKUP_PATH"

echo "Database backup created: $BACKUP_PATH"
