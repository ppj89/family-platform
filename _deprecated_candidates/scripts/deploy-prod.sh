#!/usr/bin/env sh
set -eu

if [ ! -f .env.production ]; then
  echo ".env.production is missing. Copy .env.production.example and edit secrets first."
  exit 1
fi

docker compose -f docker-compose.prod.yml --env-file .env.production up --build -d
docker compose -f docker-compose.prod.yml --env-file .env.production ps
