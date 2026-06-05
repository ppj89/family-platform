# Family Platform

가족 단위로 캘린더, 가계부, 여행 기록, 육아 기록, 일기, 커뮤니티를 함께 관리하는 운영형 웹앱입니다.

## Stack

- Frontend: React, Vite, TypeScript
- Backend: Java 25, Spring Boot, Spring Security, JPA
- Database: PostgreSQL 18
- Runtime: Docker Compose

## Local Run

```bash
npm install
npm run dev
```

This project requires Node `22.12.0` or newer. On this Windows workspace a portable Node can be used through:

```powershell
.\scripts\npm-tools.cmd install
.\scripts\npm-tools.cmd run dev
```

API와 DB를 함께 띄울 때:

```bash
docker compose up --build -d
```

기본 API 주소는 `http://localhost:8080/api`입니다.

## Build And Test

```bash
npm run build
```

```powershell
cmd /c "set JAVA_HOME=%CD%\.tools\jdk-25\jdk-25.0.3+9&& set PATH=%CD%\.tools\jdk-25\jdk-25.0.3+9\bin;%CD%\.tools\maven\apache-maven-3.9.16\bin;%PATH%&& mvn -f backend\pom.xml test"
```

## Production Prep

1. Copy `.env.production.example` to `.env.production`.
2. Change every secret value before deployment.
3. Set `VITE_API_BASE_URL` to the public API URL.
4. Set `APP_CORS_ALLOWED_ORIGINS` to the public web origin.
5. Run:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up --build -d
```

## Security Notes

- Passwords are stored with BCrypt.
- Access tokens are signed and include a server-side active session id.
- A second login first returns a duplicate-login response; confirmed force login invalidates the previous token.
- Five failed password attempts lock the account for five minutes.
- Family data APIs are scoped by family membership and permissions.
