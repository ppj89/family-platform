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
- Move uploads to S3-compatible storage later when traffic or disk usage grows.

## Run

HTTP only:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up --build -d
```

HTTPS with Caddy:

```bash
scripts/deploy-prod-https.sh
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

For a staging server only, you can run the full API integration test:

```bash
API_BASE_URL=http://localhost/api sh scripts/test-go-api.sh
```

This creates and removes test data. Do not run it against production data without a fresh backup.

## Database

The production API runs on Go. On startup it creates the required tables and indexes when they do not already exist.

- Existing PostgreSQL data is reused.
- Back up the database before every deploy.
- Keep the old Spring Boot backend folder only as a temporary migration reference until production testing is complete.

Create a PostgreSQL backup before every production deploy:

```bash
scripts/backup-db.sh
scripts/backup-uploads.sh
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
