#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-$(pwd)}"
BACKUP_TIME="${BACKUP_TIME:-15 3 * * *}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
CRON_FILE="${CRON_FILE:-/etc/cron.d/family-platform-backup}"

if [ "$(id -u)" -ne 0 ]; then
  echo "Run with sudo so the cron file can be written to $CRON_FILE." >&2
  exit 1
fi

if [ ! -f "$APP_DIR/.env.production" ]; then
  echo "$APP_DIR/.env.production is missing." >&2
  exit 1
fi

cat > "$CRON_FILE" <<EOF
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin

$BACKUP_TIME root cd "$APP_DIR" && mkdir -p backups && set -a && . .env.production && set +a && export DB_CONTAINER=\${DB_CONTAINER_NAME:-family-platform-db} UPLOADS_VOLUME=\${UPLOADS_VOLUME_NAME:-family_platform_prod_uploads} BACKUP_DIR=backups && scripts/backup-db.sh && scripts/backup-uploads.sh && find backups -type f \( -name '*.dump' -o -name 'uploads-*.tar.gz' \) -mtime +$BACKUP_RETENTION_DAYS -delete >> backups/backup.log 2>&1
EOF

chmod 0644 "$CRON_FILE"

echo "Backup cron installed at $CRON_FILE"
echo "Schedule: $BACKUP_TIME"
echo "Retention: $BACKUP_RETENTION_DAYS days"
