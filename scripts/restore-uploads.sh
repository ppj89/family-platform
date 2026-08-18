#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Usage: scripts/restore-uploads.sh <uploads.tar.gz>" >&2
  exit 1
fi

BACKUP_PATH="$1"
if [ ! -f "$BACKUP_PATH" ]; then
  echo "Uploads backup not found: $BACKUP_PATH" >&2
  exit 1
fi

VOLUME="${UPLOADS_VOLUME:-family_platform_prod_uploads}"
BACKUP_DIR="$(cd "$(dirname "$BACKUP_PATH")" && pwd)"
BACKUP_FILE="$(basename "$BACKUP_PATH")"

docker run --rm \
  -v "$VOLUME:/data" \
  -v "$BACKUP_DIR:/backup:ro" \
  alpine:3.22 \
  sh -c "rm -rf /data/* && cd /data && tar -xzf /backup/$BACKUP_FILE"

echo "Uploads restore completed."
