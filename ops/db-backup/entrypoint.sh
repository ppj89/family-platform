#!/bin/sh
set -eu

: "${POSTGRES_DB:?POSTGRES_DB is required}"
: "${POSTGRES_USER:?POSTGRES_USER is required}"
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}"
: "${APP_MEDIA_S3_ENDPOINT:?APP_MEDIA_S3_ENDPOINT is required}"
: "${APP_MEDIA_S3_BUCKET:?APP_MEDIA_S3_BUCKET is required}"
: "${APP_MEDIA_S3_ACCESS_KEY_ID:?APP_MEDIA_S3_ACCESS_KEY_ID is required}"
: "${APP_MEDIA_S3_SECRET_ACCESS_KEY:?APP_MEDIA_S3_SECRET_ACCESS_KEY is required}"

interval="${APP_DB_BACKUP_INTERVAL_SECONDS:-86400}"
case "$interval" in
  ''|*[!0-9]*) echo "APP_DB_BACKUP_INTERVAL_SECONDS must be a positive integer" >&2; exit 1 ;;
esac
if [ "$interval" -le 0 ]; then
  echo "APP_DB_BACKUP_INTERVAL_SECONDS must be a positive integer" >&2
  exit 1
fi

control_path="${APP_DB_BACKUP_CONTROL_PATH:-/var/run/family-platform-db-backup}"
mkdir -p "$control_path"

finish_manual_run() {
  run_id="$1"
  status="$2"
  case "$status" in
    COMPLETED)
      processed_count=1
      message="외부 저장소 데이터베이스 백업을 완료했습니다."
      ;;
    FAILED)
      processed_count=0
      message="외부 저장소 데이터베이스 백업에 실패했습니다. db-backup 컨테이너 로그를 확인하세요."
      ;;
    *)
      echo "database backup manual status is invalid: $status" >&2
      return 1
      ;;
  esac
  PGPASSWORD="$POSTGRES_PASSWORD" psql \
    -h "${POSTGRES_HOST:-db}" \
    -p "${POSTGRES_PORT:-5432}" \
    -U "$POSTGRES_USER" \
    -d "$POSTGRES_DB" \
    -v ON_ERROR_STOP=1 \
    -v run_id="$run_id" \
    -c "update batch_run_histories set completed_at = now(), status = '$status', processed_count = $processed_count, message = '$message' where id = $run_id" \
    >/dev/null
}

run_backup() {
  run_id="${1:-}"
  if python3 /usr/local/bin/backup.py; then
    if [ -n "$run_id" ]; then
      finish_manual_run "$run_id" "COMPLETED"
    fi
    return 0
  fi

  if [ -n "$run_id" ]; then
    finish_manual_run "$run_id" "FAILED" || true
  fi
  return 1
}

process_manual_requests() {
  found=1
  for request in "$control_path"/request-*.json; do
    [ -f "$request" ] || continue
    found=0
    processing="${request}.processing"
    mv "$request" "$processing"
    run_id=$(sed -n 's/.*"runId"[[:space:]]*:[[:space:]]*\([0-9][0-9]*\).*/\1/p' "$processing" | head -n 1)
    rm -f "$processing"
    if [ -z "$run_id" ]; then
      echo "database backup manual request ignored: invalid run id" >&2
      continue
    fi
    echo "database backup manual request received: run_id=$run_id"
    run_backup "$run_id" || true
  done
  return "$found"
}

has_manual_requests() {
  for request in "$control_path"/request-*.json; do
    [ -f "$request" ] && return 0
  done
  return 1
}

wait_for_next_run() {
  remaining="$1"
  while [ "$remaining" -gt 0 ]; do
    if has_manual_requests; then
      return 0
    fi
    step=20
    if [ "$remaining" -lt "$step" ]; then
      step="$remaining"
    fi
    sleep "$step"
    remaining=$((remaining - step))
  done
  return 1
}

while true; do
  if process_manual_requests; then
	  wait_for_next_run "$interval" || true
    continue
  fi
  if ! run_backup; then
    echo "database backup failed; retrying in one hour" >&2
    wait_for_next_run 3600 || true
    continue
  fi
  wait_for_next_run "$interval" || true
done
