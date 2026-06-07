#!/usr/bin/env bash
set -euo pipefail

VOLUME="${UPLOADS_VOLUME:-family-platform_family_platform_uploads}"
BACKUP_DIR="${BACKUP_DIR:-backups}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_PATH="$BACKUP_DIR/uploads-$TIMESTAMP.tar.gz"

mkdir -p "$BACKUP_DIR"
docker run --rm \
  -v "$VOLUME:/data:ro" \
  -v "$(pwd)/$BACKUP_DIR:/backup" \
  alpine:3.22 \
  sh -c "cd /data && tar -czf /backup/$(basename "$BACKUP_PATH") ."

echo "Uploads backup created: $BACKUP_PATH"
