# Family Platform API

Spring Boot + PostgreSQL backend for the family platform.

## Local Requirements

- Java 25 GA or newer
- Docker Desktop
- Maven is optional when running through Docker

Current backend baseline:

- Java: OpenJDK 25 GA
- Spring Boot: 4.0.6
- Web stack: Spring MVC starter for Spring Boot 4
- Maven: 3.9.16 in Docker build image
- PostgreSQL: 18.4

## Run With Docker

From the project root:

```bash
docker compose up --build
```

API health check:

```bash
curl http://localhost:8080/api/health
```

Docker Desktop needs Windows administrator approval and WSL/virtualization features. If Docker is not available on the
development PC, use the local H2 profile below.

## Run Locally Without Docker

From the project root:

```cmd
scripts\start-backend-local.cmd
```

This uses:

- Java 25 from `.tools/jdk-25`
- Maven 3.9.16 from `.tools/maven`
- H2 file database at `backend/.data`

Local API health check:

```bash
curl http://localhost:8080/api/health
```

H2 console:

- `http://localhost:8080/h2-console`
- JDBC URL: `jdbc:h2:file:./.data/family-platform`
- User: `sa`
- Password: empty

## API Examples

```bash
curl "http://localhost:8080/api/families"

curl -X POST "http://localhost:8080/api/trips?familyId=1" \
  -H "Content-Type: application/json" \
  -d "{\"title\":\"제주도 여행\",\"startDate\":\"2026-06-01\",\"endDate\":\"2026-06-03\",\"description\":\"2박 3일\"}"

curl "http://localhost:8080/api/trips?familyId=1"
```

## First API Scope

- Family member permissions
- Common code groups/codes by family and menu
- Calendar schedules
- Ledger entries and summary
- Family group seed/read
- Trip list/create/update/delete
- Travel record list/create/update/delete
- Family diary list/create/update/delete
- Baby profile and baby record list/create/update/delete
- Community post and comment list/detail/create/update/delete

The frontend is still mostly mock/legacy UI. Connect menus one API at a time, starting with travel records.

## Main Endpoints

- `GET /api/health`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/families`
- `GET /api/families/{familyId}/members`
- `GET /api/common-code-groups?familyId=1&menuKey=ledger`
- `GET /api/schedules?familyId=1&startDate=2026-06-01&endDate=2026-06-30`
- `GET /api/ledger-entries?familyId=1&startDate=2026-06-01&endDate=2026-06-30`
- `GET /api/ledger-entries/summary?familyId=1&startDate=2026-06-01&endDate=2026-06-30`
- `GET /api/trips?familyId=1`
- `GET /api/trips/{tripId}/records`
- `GET /api/diaries?familyId=1&startDate=2026-06-01&endDate=2026-06-30`
- `GET /api/babies?familyId=1`
- `GET /api/babies/{babyId}/records`
- `GET /api/community/posts?boardType=free`
- `GET /api/community/posts/{postId}`

## Security Baseline

- Passwords are stored with BCrypt, never as plain text.
- API requests require `Authorization: Bearer <accessToken>` except health and auth endpoints.
- JPA repositories and parameter binding are used instead of string-built SQL.
- CORS origins are allow-listed through `APP_CORS_ALLOWED_ORIGINS`.
- Set a strong production token secret through `APP_SECURITY_TOKEN_SECRET`.
