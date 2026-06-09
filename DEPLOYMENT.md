# Deployment Checklist

## Server

- Prepare one Linux server with Docker and Docker Compose.
- Open ports `80` and `443`.
- Point the domain DNS A record to the server IP.
- Use `docker-compose.https.yml` for automatic HTTPS with Caddy.

For a new Ubuntu server, run:

```bash
curl -fsSL https://raw.githubusercontent.com/ppj89/family-platform/main/scripts/bootstrap-ubuntu.sh -o bootstrap-ubuntu.sh
chmod +x bootstrap-ubuntu.sh
REPO_URL=https://github.com/ppj89/family-platform.git APP_DIR=/opt/family-platform ./bootstrap-ubuntu.sh
```

If Docker group permission is not active immediately, log out and back in, then continue from `/opt/family-platform`.

The bootstrap script runs basic Ubuntu hardening by default:

- 2 GB swap file for small VPS instances
- UFW with OpenSSH, 80, and 443 allowed
- unattended security updates
- Docker JSON log rotation

To skip it:

```bash
RUN_HARDENING=false ./bootstrap-ubuntu.sh
```

## Environment

Create `.env.production` from `.env.production.example`, or generate one with strong random secrets:

```bash
scripts/init-prod-env.sh https://your-domain your-domain
```

On Windows:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\init-prod-env.ps1 -Domain https://your-domain -AppDomain your-domain
```

Use strong random values for:

- `POSTGRES_PASSWORD`
- `APP_SECURITY_TOKEN_SECRET` (minimum 48 characters; production startup fails if the default dev secret is used)

Set:

- `APP_CORS_ALLOWED_ORIGINS=https://your-domain`
- `VITE_API_BASE_URL=/api`
- `APP_AUTH_EMAIL_VERIFICATION_REQUIRED=true`
- `APP_SMTP_HOST`, `APP_SMTP_PORT`, `APP_SMTP_FROM`, and optional SMTP credentials for email verification
- `APP_MEDIA_MAX_FILES_PER_POST=6`
- `APP_MEDIA_MAX_IMAGE_SIZE=8MB`
- `APP_MEDIA_MAX_VIDEO_SIZE=30MB`

The default media policy is intentionally conservative for low-cost operation:

- Images: up to 8 MB in the web UI
- Videos: up to 30 MB in the web UI
- Attachments: up to 6 files and 40 MB per request
- Nginx `client_max_body_size` is set to 40 MB to match the backend request limit.
- Uploaded files are stored in the `family_platform_uploads` Docker volume by default.
- Back up both the PostgreSQL volume and the uploads volume before production deploys.
- For the lowest-cost production path, move uploads to Cloudflare R2. See [docs/cloudflare-r2-storage.md](./docs/cloudflare-r2-storage.md).

## Run

HTTP only:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up --build -d
```

HTTPS with Caddy:

```bash
scripts/deploy-prod-https.sh
```

After the first deployment, use the update script for normal releases. It backs up the running database and uploads volume when they exist, pulls the latest Git commit, redeploys the HTTPS stack, and verifies `/health` and `/api/health`.

```bash
scripts/update-prod-https.sh
```

Useful options:

```bash
SKIP_BACKUP=1 scripts/update-prod-https.sh
SKIP_GIT_PULL=1 scripts/update-prod-https.sh
HEALTH_BASE_URL=http://127.0.0.1 scripts/update-prod-https.sh
```

On Windows:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\deploy-prod-https.ps1
```

## Verify

```bash
curl http://localhost/health
curl http://localhost/api/health
docker compose -f docker-compose.prod.yml --env-file .env.production ps
```

Before the first public deploy, validate production settings:

```bash
scripts/validate-prod-config.sh .env.production
```

Or run the production check helper:

```bash
scripts/check-prod.sh
```

On Windows:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\check-prod.ps1
```

For a staging server only, you can run the full API integration test:

```bash
API_BASE_URL=http://localhost/api sh scripts/test-go-api.sh
```

This creates and removes test data. Do not run it against production data without a fresh backup.

To test the full production web/API/DB stack on a temporary port:

```bash
WEB_PORT=18080 WEB_BASE_URL=http://127.0.0.1:18080 scripts/test-prod-stack.sh
```

This starts an isolated Docker Compose project, verifies `/health` and `/api/health`, runs the full API integration test through the web proxy, and removes the temporary containers and volumes.

## Database

The production API runs on Go. On startup it creates the required tables and indexes when they do not already exist.

- Existing PostgreSQL data is reused.
- Back up the database before every deploy.

Create a PostgreSQL backup before every production deploy:

```bash
scripts/backup-db.sh
scripts/backup-uploads.sh
```

Install an automatic daily backup job on the production server:

```bash
sudo APP_DIR=/opt/family-platform BACKUP_RETENTION_DAYS=14 scripts/install-backup-cron.sh
```

The default schedule is 03:15 every day. Override it with `BACKUP_TIME`, using normal cron syntax:

```bash
sudo APP_DIR=/opt/family-platform BACKUP_TIME="30 2 * * *" scripts/install-backup-cron.sh
```

On Windows:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\backup-db.ps1
powershell -ExecutionPolicy Bypass -File scripts\backup-uploads.ps1
```

Restore commands:

```bash
scripts/restore-db.sh backups/family_platform-YYYYMMDD-HHMMSS.dump
scripts/restore-uploads.sh backups/uploads-YYYYMMDD-HHMMSS.tar.gz
```

On Windows:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\restore-db.ps1 -BackupPath backups\family_platform-YYYYMMDD-HHMMSS.dump
powershell -ExecutionPolicy Bypass -File scripts\restore-uploads.ps1 -BackupPath backups\uploads-YYYYMMDD-HHMMSS.tar.gz
```

## Mobile App Path

The current app is prepared as a PWA. For store distribution, wrap the built web app with Capacitor after the web domain and API URL are finalized.
