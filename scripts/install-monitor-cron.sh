#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-$(pwd)}"
MONITOR_TIME="${MONITOR_TIME:-*/5 * * * *}"
CRON_FILE="${CRON_FILE:-/etc/cron.d/family-platform-monitor}"
BASE_URL="${BASE_URL:-http://127.0.0.1}"
DISK_WARN_PERCENT="${DISK_WARN_PERCENT:-85}"
ALERT_WEBHOOK_URL="${ALERT_WEBHOOK_URL:-}"
EXPECT_SSO_CONFIGURED="${EXPECT_SSO_CONFIGURED:-false}"

if [ "$(id -u)" -ne 0 ]; then
  echo "Run with sudo so the cron file can be written to $CRON_FILE." >&2
  exit 1
fi

if [ ! -f "$APP_DIR/.env.production" ]; then
  echo "$APP_DIR/.env.production is missing." >&2
  exit 1
fi

mkdir -p "$APP_DIR/logs"

cat > "$CRON_FILE" <<EOF
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin

$MONITOR_TIME root cd "$APP_DIR" && mkdir -p logs && BASE_URL="$BASE_URL" DISK_WARN_PERCENT="$DISK_WARN_PERCENT" ALERT_WEBHOOK_URL="$ALERT_WEBHOOK_URL" EXPECT_SSO_CONFIGURED="$EXPECT_SSO_CONFIGURED" scripts/monitor-prod.sh >> logs/monitor.log 2>&1
EOF

chmod 0644 "$CRON_FILE"

echo "Monitor cron installed at $CRON_FILE"
echo "Schedule: $MONITOR_TIME"
echo "Base URL: $BASE_URL"
echo "Disk warning threshold: $DISK_WARN_PERCENT%"
echo "Expect SSO configured: $EXPECT_SSO_CONFIGURED"
