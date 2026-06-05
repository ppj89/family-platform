# Deployment Checklist

## Server

- Prepare one Linux server with Docker and Docker Compose.
- Open ports `80` and `443`.
- Point the domain DNS A record to the server IP.
- Put HTTPS in front of the `web` service with a reverse proxy or cloud load balancer.

## Environment

Create `.env.production` from `.env.production.example`.

Use strong random values for:

- `POSTGRES_PASSWORD`
- `APP_SECURITY_TOKEN_SECRET`

Set:

- `APP_CORS_ALLOWED_ORIGINS=https://your-domain`
- `VITE_API_BASE_URL=/api`

## Run

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up --build -d
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
