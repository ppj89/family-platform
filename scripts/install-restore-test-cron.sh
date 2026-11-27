#!/usr/bin/env bash
# Installs a weekly cron job that runs scripts/verify-backup-restore.sh.
set -euo pipefail

APP_DIR="${APP_DIR:-$(pwd)}"
RESTORE_TEST_TIME="${RESTORE_TEST_TIME:-30 4 * * 0}"
CRON_FILE="${CRON_FILE:-/etc/cron.d/family-platform-restore-test}"
ALERT_WEBHOOK_URL="${ALERT_WEBHOOK_URL:-}"

if [ "$(id -u)" -ne 0 ]; then
  echo "Run with sudo so the cron file can be written to $CRON_FILE." >&2
  exit 1
fi

mkdir -p "$APP_DIR/logs"

cat > "$CRON_FILE" <<EOF
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin

$RESTORE_TEST_TIME root cd "$APP_DIR" && ALERT_WEBHOOK_URL="$ALERT_WEBHOOK_URL" scripts/verify-backup-restore.sh >> logs/restore-test.log 2>&1
EOF

chmod 0644 "$CRON_FILE"
echo "Restore test cron installed at $CRON_FILE ($RESTORE_TEST_TIME)"
