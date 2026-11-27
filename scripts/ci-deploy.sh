#!/usr/bin/env bash
# Server-side entry point for the CI "Deploy server" job.
#
# The CI deploy key is pinned to this script in root's authorized_keys
# (command="…/scripts/ci-deploy.sh",no-pty,…), so that key can do nothing
# but ask for a deploy. The requested commit arrives in SSH_ORIGINAL_COMMAND
# as "deploy <40-char sha>" and must already be on origin/main.
#
# Flow: backup → fast-forward to the commit → rebuild/restart → wait until
# the URLs answer AND Docker reports every container healthy. On any
# failure the previous commit is redeployed (no second backup) and the
# script exits non-zero so the CI job fails visibly.
#
# Rollback restores code only. A release that ran a destructive DB
# migration has to be restored from backup by hand (scripts/restore-db.sh).
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/family-platform}"
ENV_FILE="${ENV_FILE:-.env.production}"
LOG_FILE="$APP_DIR/logs/deploy.log"
COMPOSE=(docker compose -f docker-compose.prod.yml -f docker-compose.https.yml --env-file "$ENV_FILE")

cd "$APP_DIR"
mkdir -p logs
exec > >(tee -a "$LOG_FILE") 2>&1

log() { echo "[$(date '+%F %T')] $*"; }

request="${SSH_ORIGINAL_COMMAND:-${*:-}}"
read -r action target extra <<<"$request" || true
if [ "${action:-}" != "deploy" ] || [ -n "${extra:-}" ] || ! [[ "${target:-}" =~ ^[0-9a-f]{40}$ ]]; then
  log "rejected request: '$request' (expected: deploy <40-char sha>)"
  exit 2
fi

# One deploy at a time; a second request waits for the first to finish.
exec 9>/tmp/family-platform-deploy.lock
flock 9

git fetch -q origin main
if ! git merge-base --is-ancestor "$target" origin/main; then
  log "rejected $target: not on origin/main"
  exit 2
fi
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  log "aborted: server checkout has local changes"
  git status --short --untracked-files=no
  exit 1
fi

previous="$(git rev-parse HEAD)"

# Plain http://127.0.0.1 only gets Caddy's 308 redirect, which curl -f
# counts as success even with the API down. Go through HTTPS on the real
# domain, pinned to this machine, so the whole Caddy → web → api path is hit.
domain="$(sed -n 's/^APP_DOMAIN=//p' "$ENV_FILE" | tail -n 1 | tr -d '"'"'"' \r')"
if [ -z "$domain" ]; then
  log "APP_DOMAIN is missing in $ENV_FILE"
  exit 1
fi
health_curl() {
  curl -fsS --max-time 5 --resolve "$domain:443:127.0.0.1" "https://$domain$1" >/dev/null
}
export HEALTH_BASE_URL="https://$domain"

wait_until_healthy() {
  for _ in $(seq 1 60); do
    unhealthy="$(docker ps --filter health=unhealthy --filter health=starting --format '{{.Names}}')"
    if [ -z "$unhealthy" ] && health_curl /health && health_curl /api/health; then
      return 0
    fi
    sleep 3
  done
  log "not healthy after 3 minutes; still unhealthy/starting: ${unhealthy:-none}"
  "${COMPOSE[@]}" ps
  return 1
}

deploy_checkout() {
  SKIP_GIT_PULL=1 SKIP_BACKUP="$1" scripts/update-prod-https.sh && wait_until_healthy
}

log "deploy $previous -> $target"
if git merge-base --is-ancestor "$previous" "$target"; then
  git merge -q --ff-only "$target"
else
  # Server was ahead of / diverged from the request (e.g. a newer deploy
  # already landed). Never move production backwards silently.
  log "rejected $target: current $previous is not its ancestor"
  exit 2
fi

if deploy_checkout 0; then
  log "deploy succeeded at $(git rev-parse --short HEAD)"
  exit 0
fi

log "deploy failed; rolling back to $previous"
git checkout -q -B main "$previous"
git branch -q --set-upstream-to=origin/main main
if deploy_checkout 1; then
  log "rollback to $(git rev-parse --short HEAD) is healthy"
else
  log "ROLLBACK ALSO FAILED — manual attention needed"
fi
exit 1
