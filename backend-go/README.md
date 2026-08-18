# Family Platform Go API

Family Platform production API is implemented in Go.

## API Surface

- `GET /api/health`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `GET /api/families`
- `GET /api/families/{familyId}/members`
- `GET/POST /api/ledger-entries`
- `GET /api/ledger-entries/summary`
- `GET/POST /api/schedules`
- `GET/POST /api/common-code-groups`
- `GET/POST /api/common-code-groups/{groupId}/codes`
- `GET/POST /api/trips`
- `GET/POST /api/trips/{tripId}/records`
- `PUT/DELETE /api/travel-records/{recordId}`
- `GET/POST /api/babies`
- `GET/POST /api/babies/{babyId}/records`
- `PUT/DELETE /api/baby-records/{recordId}`
- `GET/POST /api/diaries`
- `GET/POST /api/community/posts`
- `GET/PUT/DELETE /api/community/posts/{postId}`
- `GET/POST /api/community/posts/{postId}/comments`
- `PUT/DELETE /api/community/comments/{commentId}`
- `POST /api/media`
- `GET /api/media/files/{fileName}`
- `GET/PATCH /api/notifications`

## Security Defaults

- Passwords are hashed with bcrypt.
- Five failed password attempts lock the account for five minutes.
- Duplicate login returns `409 Conflict` unless `forceLogin=true`.
- Force login rotates the active server-side session id and invalidates the old token.
- Tokens are HMAC-SHA256 signed.
- Account withdrawal immediately disables and anonymizes the account while clearing the email and login identifiers, so the same account can register again. Withdrawn account rows are physically deleted after `APP_WITHDRAWN_ACCOUNT_RETENTION_DAYS` days. The default retention is 365 days, and the cleanup batch runs daily at 03:10 Asia/Seoul time.
- Login, data-change, activity, aggregate, and batch-run histories are retained for 365 days by default and cleaned up daily at 03:20 Asia/Seoul time.
- Holidays are stored in the `holidays` table. When `APP_HOLIDAY_SYNC_SERVICE_KEY` is set, the API syncs Korean public holidays from the public data portal daily at 03:00 Asia/Seoul time. Platform admins can review and run every batch manually from the settings screen.
- Platform admins can access every family for testing and operation.
- Regular users can access only families they belong to.
- Family member CRUD permissions are checked per resource.
- CORS origins must be configured explicitly in production.
- Basic security headers are applied by the API.

## Local Run

```powershell
$env:APP_SECURITY_TOKEN_SECRET='replace-with-at-least-64-random-characters'
$env:DATABASE_URL='postgres://family_app:family_app_password@localhost:5432/family_platform?sslmode=disable'
go run .\cmd\api
```

Docker Compose is the preferred local and production runtime:

```bash
docker compose up --build -d db api
curl http://localhost:8080/api/health
```

## Tests

Go unit test:

```bash
go test ./...
```

Full API integration test against a running API:

```bash
sh ../scripts/test-go-api.sh
```

The integration test covers authentication, duplicate login, family permissions, common codes, ledger, schedules, notifications, trips, babies, diaries, media upload validation, community posts, comments, and cleanup.
