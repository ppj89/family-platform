# Deployment Checklist

## Server

- Prepare one Linux server with Docker and Docker Compose.
- Open ports `80` and `443`.
- Point the domain DNS A record to the server IP.
- Use `docker-compose.https.yml` for automatic HTTPS with Caddy.

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
- `APP_MEDIA_MAX_FILE_SIZE=30MB`
- `APP_MEDIA_MAX_REQUEST_SIZE=40MB`
- `APP_MEDIA_MAX_FILES_PER_POST=6`

The default media policy is intentionally conservative for low-cost operation:

- Images: up to 8 MB in the web UI
- Videos: up to 30 MB in the web UI
- Attachments: up to 6 files and 40 MB per request
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
```

## Database

Flyway runs on API startup.

- Existing databases are baselined at migration version `1`.
- Empty databases are created from `backend/src/main/resources/db/migration/V1__initial_schema.sql`.

Create a PostgreSQL backup before every production deploy:

```bash
scripts/backup-db.sh
```

On Windows:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\backup-db.ps1
```

## Mobile App Path

The current app is prepared as a PWA. For store distribution, wrap the built web app with Capacitor after the web domain and API URL are finalized.
