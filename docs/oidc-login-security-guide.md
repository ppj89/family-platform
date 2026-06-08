# OIDC and SSO Login Security Guide

This project keeps the service session separate from the social login provider.
Google, Naver, and Kakao confirm who the user is. The Family Platform API still
decides which family data the user can access, which session is active, and when
an account must be locked.

## Production Prerequisites

- A real HTTPS domain, for example `https://family.example.com`.
- OAuth client credentials for each provider that will be enabled.
- A callback URL registered in each provider console:
  - Google: `https://family.example.com/api/auth/oauth/google/callback`
  - Naver: `https://family.example.com/api/auth/oauth/naver/callback`
  - Kakao: `https://family.example.com/api/auth/oauth/kakao/callback`
- The frontend must never store provider client secrets.

## Environment Variables

Use these names in `.env.production` when the domain and provider apps are ready.

```text
APP_PUBLIC_BASE_URL=https://family.example.com
APP_OAUTH_GOOGLE_CLIENT_ID=
APP_OAUTH_GOOGLE_CLIENT_SECRET=
APP_OAUTH_NAVER_CLIENT_ID=
APP_OAUTH_NAVER_CLIENT_SECRET=
APP_OAUTH_KAKAO_CLIENT_ID=
APP_OAUTH_KAKAO_CLIENT_SECRET=
```

## Recommended Backend Flow

1. The frontend opens `/api/auth/oauth/{provider}/start`.
2. The backend creates a short-lived OAuth state and nonce.
3. The backend redirects to the provider login page.
4. The provider redirects back to `/api/auth/oauth/{provider}/callback`.
5. The backend exchanges `code` for tokens on the server side.
6. The backend validates `issuer`, `audience`, `exp`, `nonce`, and provider user id.
7. The backend finds or creates one local `app_users` row for `provider + subject`.
8. The backend issues the normal Family Platform access token.
9. The normal duplicate-login and active-session checks still apply.

## Duplicate Login Rule

The `app_users.active_session_id` column is the source of truth.

```text
if active_session_id exists and forceLogin is false:
  return 409 Conflict
  message = "active session exists"

if forceLogin is true:
  replace active_session_id
  previous tokens become invalid on the next authenticated request
```

Every authenticated API request must compare the token session id with
`app_users.active_session_id`. If they differ, return `401 Unauthorized`.

## Password Login Lock Rule

Password login uses the same account table.

- After 5 failed password attempts, set `locked_until = now() + 5 minutes`.
- While locked, return `423 Locked`.
- On successful login, reset `failed_login_attempts` and `locked_until`.
- Do not compare passwords while the account is locked.

## Family Data Isolation

SSO does not replace authorization. Every family-scoped query must filter by
the authenticated user membership or by platform-admin scope.

```sql
where exists (
  select 1
  from family_members m
  where m.family_id = target.family_id
    and m.user_id = $current_user_id
    and m.can_read = true
)
```

Create, update, and delete APIs must check `can_create`, `can_update`, and
`can_delete` in the same way.

## Current Implementation Status

- Email/password register and login are implemented.
- Duplicate-login replacement is implemented through `forceLogin`.
- Five-failure account locking is implemented.
- SSO buttons are intentionally disabled until domain, HTTPS, and provider
  client credentials are configured.
- The next SSO implementation step is to add the `/start` and `/callback`
  endpoints above, then connect each provider one by one.
