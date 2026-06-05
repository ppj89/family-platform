# Family Platform

가족 단위로 캘린더, 가계부, 여행 기록, 육아 기록, 일기, 커뮤니티를 함께 관리하는 운영 준비형 웹/앱 프로젝트입니다.

## Stack

- Frontend: React, Vite, TypeScript
- Backend: Java 25, Spring Boot, Spring Security, JPA
- Database: PostgreSQL 18
- Runtime: Docker Compose
- Mobile wrapper: Capacitor Android

## Local Run

```bash
npm install
npm run dev
```

This project requires Node `22.12.0` or newer. On this Windows workspace, use the bundled portable Node:

```powershell
.\scripts\npm-tools.cmd install
.\scripts\npm-tools.cmd run dev
```

Run API and DB:

```bash
docker compose up --build -d
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

```powershell
cmd /c "set JAVA_HOME=%CD%\.tools\jdk-25\jdk-25.0.3+9&& set PATH=%CD%\.tools\jdk-25\jdk-25.0.3+9\bin;%CD%\.tools\maven\apache-maven-3.9.16\bin;%PATH%&& mvn -f backend\pom.xml test"
```

Android debug APK:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\build-android-debug.ps1
```

## Production Prep

1. Generate `.env.production`.
2. Review `APP_CORS_ALLOWED_ORIGINS`, `WEB_PORT`, and secrets.
3. Deploy with Docker Compose.

```bash
scripts/init-prod-env.sh https://your-domain your-domain
docker compose -f docker-compose.prod.yml --env-file .env.production up --build -d
```

Windows:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\init-prod-env.ps1 -Domain https://your-domain -AppDomain your-domain
powershell -ExecutionPolicy Bypass -File scripts\deploy-prod.ps1
```

HTTPS deployment:

```bash
scripts/deploy-prod-https.sh
```

## Security Notes

- Passwords are stored with BCrypt.
- Access tokens are signed and include a server-side active session id.
- A second login first returns a duplicate-login response; confirmed force login invalidates the previous token.
- Five failed password attempts lock the account for five minutes.
- Family data APIs are scoped by family membership and permissions.
- Flyway manages production database schema changes.
- PostgreSQL backup and restore scripts are included under `scripts/`.
