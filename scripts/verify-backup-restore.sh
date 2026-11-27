#!/usr/bin/env bash
# Proves the off-site backup can actually be restored.
#
# 1. Downloads the newest dump from R2 (via the db-backup container, which
#    already holds the R2 credentials and boto3).
# 2. Restores it into a throwaway Postgres container with no network,
#    using the same image as production.
# 3. Checks every table in the live schema exists in the restore, every
#    table can be read, and the core tables are not empty.
# 4. Removes the container and the downloaded dump.
#
# Exit 0 = backup restorable. Any failure exits non-zero and, when
# ALERT_WEBHOOK_URL is set, sends an alert. Run weekly from cron
# (scripts/install-restore-test-cron.sh) and after backup changes.
set -euo pipefail

APP_DIR="${APP_DIR:-$(pwd)}"
ENV_FILE="${ENV_FILE:-.env.production}"
DB_CONTAINER="${DB_CONTAINER:-family-platform-db}"
BACKUP_CONTAINER="${BACKUP_CONTAINER:-family-platform-db-backup}"
TEST_CONTAINER="family-platform-restore-test"
ALERT_WEBHOOK_URL="${ALERT_WEBHOOK_URL:-}"
# Tables that are never empty on a live install; an empty restore of these
# means the dump is not what we think it is.
CORE_TABLES="${CORE_TABLES:-app_users family_groups family_members}"

cd "$APP_DIR"
set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

work="$(mktemp -d /tmp/family-platform-restore.XXXXXX)"
cleanup() {
  docker rm -f "$TEST_CONTAINER" >/dev/null 2>&1 || true
  docker exec "$BACKUP_CONTAINER" rm -f /tmp/restore-test.dump >/dev/null 2>&1 || true
  rm -rf "$work"
}
trap cleanup EXIT

fail() {
  echo "RESTORE TEST FAILED: $*" >&2
  if [ -n "$ALERT_WEBHOOK_URL" ]; then
    message="Family Platform backup restore test failed: $*"
    escaped="$(printf '%s' "$message" | sed 's/\\/\\\\/g; s/"/\\"/g')"
    curl -fsS -H "Content-Type: application/json" \
      -d "{\"text\":\"$escaped\",\"content\":\"$escaped\"}" "$ALERT_WEBHOOK_URL" >/dev/null || true
  fi
  exit 1
}
trap 'fail "unexpected error on line $LINENO"' ERR

echo "[$(date '+%F %T')] restore test start"

# --- 1. newest off-site dump ------------------------------------------------
key="$(docker exec -i "$BACKUP_CONTAINER" python3 - <<'PY'
import os, boto3
c = boto3.client("s3", endpoint_url=os.environ["APP_MEDIA_S3_ENDPOINT"].rstrip("/"),
                 region_name=os.environ.get("APP_MEDIA_S3_REGION", "auto"),
                 aws_access_key_id=os.environ["APP_MEDIA_S3_ACCESS_KEY_ID"],
                 aws_secret_access_key=os.environ["APP_MEDIA_S3_SECRET_ACCESS_KEY"])
bucket = os.environ["APP_MEDIA_S3_BUCKET"]
prefix = os.environ.get("APP_DB_BACKUP_PREFIX", "database-backups/").strip().strip("/") + "/"
items = [o for p in c.get_paginator("list_objects_v2").paginate(Bucket=bucket, Prefix=prefix)
         for o in p.get("Contents", []) if o["Key"].endswith(".dump")]
if not items:
    raise SystemExit("no backups found")
newest = max(items, key=lambda o: o["LastModified"])
c.download_file(bucket, newest["Key"], "/tmp/restore-test.dump")
print(newest["Key"], newest["LastModified"].isoformat(), newest["Size"])
PY
)" || fail "could not download the newest backup from R2"
echo "newest backup: $key"
docker cp -q "$BACKUP_CONTAINER:/tmp/restore-test.dump" "$work/restore.dump"

# Older than ~2 days means the daily off-site backup has stopped.
backup_time="$(printf '%s' "$key" | awk '{print $2}')"
age_hours=$(( ( $(date +%s) - $(date -d "$backup_time" +%s) ) / 3600 ))
[ "$age_hours" -le 50 ] || fail "newest off-site backup is ${age_hours}h old ($key)"

# --- 2. restore into an isolated container ---------------------------------
image="$(docker inspect -f '{{.Config.Image}}' "$DB_CONTAINER")"
docker rm -f "$TEST_CONTAINER" >/dev/null 2>&1 || true
docker run -d --name "$TEST_CONTAINER" --network none --memory 384m \
  -e POSTGRES_USER=restore -e POSTGRES_PASSWORD="$(head -c 24 /dev/urandom | base64 | tr -dc A-Za-z0-9)" \
  -e POSTGRES_DB=restore "$image" >/dev/null

# Check over TCP: during first-run init the image starts a temporary server
# on the Unix socket only, then restarts it. A socket check can catch that
# temporary server and race the restart; the real server is the first one
# listening on 127.0.0.1 (loopback exists even with --network none).
ready() { docker exec "$TEST_CONTAINER" pg_isready -h 127.0.0.1 -U restore -d restore >/dev/null 2>&1; }
for _ in $(seq 1 45); do
  ready && break
  sleep 2
done
ready || fail "test Postgres did not start"

docker cp -q "$work/restore.dump" "$TEST_CONTAINER:/tmp/restore.dump"
docker exec "$TEST_CONTAINER" pg_restore -U restore -d restore --no-owner --no-privileges \
  --exit-on-error /tmp/restore.dump || fail "pg_restore failed for $key"

# --- 3. verify ---------------------------------------------------------------
q_live() { docker exec "$DB_CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "$1"; }
q_test() { docker exec "$TEST_CONTAINER" psql -U restore -d restore -Atc "$1"; }
tables_sql="select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by 1"

live_tables="$(q_live "$tables_sql")"
restored_tables="$(q_test "$tables_sql")"
missing="$(comm -23 <(printf '%s\n' "$live_tables") <(printf '%s\n' "$restored_tables") | tr '\n' ' ')"
[ -z "${missing// /}" ] || fail "tables missing from restore: $missing"

total_rows=0
for table in $restored_tables; do
  rows="$(q_test "select count(*) from \"$table\"")" || fail "cannot read restored table $table"
  total_rows=$((total_rows + rows))
done
for table in $CORE_TABLES; do
  rows="$(q_test "select count(*) from \"$table\"")"
  live_rows="$(q_live "select count(*) from \"$table\"")"
  echo "  $table: restored=$rows live=$live_rows"
  [ "$rows" -gt 0 ] || fail "core table $table is empty in the restore"
done

echo "[$(date '+%F %T')] restore test passed: $key — $(printf '%s\n' "$restored_tables" | wc -l) tables, $total_rows rows"
