# Operations Runbook

This runbook is for the production Linux server after the first deployment.

## Daily Check

From the server:

```bash
cd /opt/family-platform
scripts/check-prod.sh
```

From this Windows workspace:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\check-server.ps1
```

Expected result:

- `web: ok`
- `api: ok`
- `android debug apk: ok` when the test APK has been published
- Docker services show as running or healthy.

The current HTTP test URL is:

```text
http://192.145.44.103
```

Use `http://`, not `https://`, until a domain and HTTPS are configured.

## Monitoring

Run a one-time monitor check:

```bash
cd /opt/family-platform
scripts/monitor-prod.sh
```

Install a 5-minute health and disk monitor:

```bash
sudo APP_DIR=/opt/family-platform scripts/install-monitor-cron.sh
```

Optional alert webhook:

```bash
sudo APP_DIR=/opt/family-platform ALERT_WEBHOOK_URL="https://example.com/webhook" scripts/install-monitor-cron.sh
```

Monitor logs are written to `logs/monitor.log`.

## Normal Deploy

```bash
cd /opt/family-platform
scripts/validate-prod-config.sh .env.production
scripts/update-prod-https.sh
```

The update script backs up the database and uploads volume when they exist, pulls the latest Git commit, redeploys the HTTPS stack, and verifies health endpoints.

For the temporary HTTP/IP server, deploy with the production compose file only:

```bash
cd /opt/family-platform
git pull
docker compose -f docker-compose.prod.yml --env-file .env.production up --build -d
scripts/check-prod.sh
```

## Rollback

Use rollback when a new deployment is unhealthy or a critical feature breaks.

```bash
cd /opt/family-platform
scripts/rollback-prod-https.sh HEAD~1
```

You can also roll back to a specific commit:

```bash
scripts/rollback-prod-https.sh 5f86e57
```

The rollback script creates backups before switching code and redeploying.

## Backups

Manual backup:

```bash
scripts/backup-db.sh
scripts/backup-uploads.sh
```

Install automatic daily backups:

```bash
sudo APP_DIR=/opt/family-platform scripts/install-backup-cron.sh
```

Restore:

```bash
scripts/restore-db.sh backups/family_platform-YYYYMMDD-HHMMSS.dump
scripts/restore-uploads.sh backups/uploads-YYYYMMDD-HHMMSS.tar.gz
```

## Logs

```bash
docker compose -f docker-compose.prod.yml -f docker-compose.https.yml --env-file .env.production logs --tail=100 api
docker compose -f docker-compose.prod.yml -f docker-compose.https.yml --env-file .env.production logs --tail=100 web
docker compose -f docker-compose.prod.yml -f docker-compose.https.yml --env-file .env.production logs --tail=100 caddy
```

## Disk Usage

```bash
df -h
docker system df
du -sh backups
```

If disk usage grows quickly, move uploaded media to external object storage before public growth.

## Server Hardening

The initial Ubuntu bootstrap runs hardening by default. To run it again:

```bash
cd /opt/family-platform
sudo scripts/harden-ubuntu.sh
```

Useful options:

```bash
sudo SWAP_SIZE=4G scripts/harden-ubuntu.sh
sudo ENABLE_UFW=false scripts/harden-ubuntu.sh
sudo DOCKER_LOG_MAX_SIZE=20m DOCKER_LOG_MAX_FILE=5 scripts/harden-ubuntu.sh
```
