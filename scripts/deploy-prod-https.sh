#!/usr/bin/env sh
set -eu

if [ ! -f .env.production ]; then
  echo ".env.production is missing. Run scripts/init-prod-env.sh first." >&2
  exit 1
fi

if ! grep -q '^APP_DOMAIN=' .env.production; then
  echo "APP_DOMAIN is missing in .env.production." >&2
  echo "Add APP_DOMAIN=your-domain.com before HTTPS deployment." >&2
  exit 1
fi

docker compose \
  -f docker-compose.prod.yml \
  -f docker-compose.https.yml \
  --env-file .env.production \
  up --build -d

docker compose \
  -f docker-compose.prod.yml \
  -f docker-compose.https.yml \
  --env-file .env.production \
  ps
