# Family Platform

Family Platform is a production-ready family workspace for shared calendars, household ledgers, travel records, baby care logs, diaries, family groups, and community posts.

## Stack

- Frontend: React, Vite, TypeScript
- Backend: Go 1.26, net/http, pgx
- Database: PostgreSQL 18
- Runtime: Docker Compose
- Web proxy: Nginx, optional Caddy HTTPS
- Mobile wrapper: Capacitor Android/iOS

## Local Run

Install frontend dependencies and start Vite:

```bash
npm install
npm run dev
```

This project requires Node `22.12.0` or newer. On this Windows workspace, use the bundled portable Node:

```powershell
.\scripts\npm-tools.cmd install
.\scripts\npm-tools.cmd run dev
```

Run the local API and database:

```bash
docker compose up --build -d db api
```

Default API URL:

```text
http://localhost:8080/api
```

## Build And Test

Frontend:

```bash
npm run build
```

Backend:

```bash
cd backend-go
go test ./...
```

Local Docker-based Go test from Windows:

```powershell
docker run --rm -v "${PWD}\backend-go:/src" -w /src golang:1.26.4-alpine sh -lc "/usr/local/go/bin/go test ./..."
```

Full API integration test:

```powershell
docker run --rm -v "${PWD}:/workspace" -w /workspace -e API_BASE_URL=http://host.docker.internal:8080/api python:3.13-alpine sh -lc "apk add --no-cache curl >/dev/null && sh scripts/test-go-api.sh"
```

Full production stack smoke test:

```bash
WEB_PORT=18080 WEB_BASE_URL=http://127.0.0.1:18080 scripts/test-prod-stack.sh
```

Android debug APK:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\build-android-debug.ps1
```

## Production Prep

1. Prepare a Linux server with Docker.
2. Generate `.env.production`.
3. Review `APP_CORS_ALLOWED_ORIGINS`, `APP_DOMAIN`, `WEB_PORT`, and secrets.
4. Deploy with Docker Compose and Caddy HTTPS.
5. Install automatic backups.

First deployment:

```bash
scripts/init-prod-env.sh https://your-domain your-domain
scripts/deploy-prod-https.sh
```

Normal production updates:

```bash
scripts/update-prod-https.sh
```

Automatic daily backups:

```bash
sudo APP_DIR=/opt/family-platform scripts/install-backup-cron.sh
```

Server setup details are in [DEPLOYMENT.md](./DEPLOYMENT.md).

## Security Notes

- Passwords are stored with bcrypt.
- Access tokens are signed and include a server-side active session id.
- Duplicate login can be force-confirmed to invalidate the previous token.
- Five failed password attempts lock the account for five minutes.
- Family data APIs are scoped by family membership and member permissions.
- Media upload accepts only image/video content types and enforces size limits.
- Caddy, Nginx, and the API apply baseline security headers.
- PostgreSQL and uploads backup/restore scripts are included under `scripts/`.
