# Security Baseline

This project is prepared for production hardening, but final deployment must use real secrets and HTTPS.

## Implemented

- BCrypt password hashing.
- Stateless bearer authentication.
- Server-side active-session validation.
- Duplicate login confirmation flow.
- Previous token invalidation after confirmed force login.
- Five failed password attempts lock the account for five minutes.
- CORS allow-list through environment variables.
- Family-scoped access services for protected data.

## Before Public Launch

- Use HTTPS only.
- Replace all default secrets.
- Keep `.env.production` out of Git.
- Run dependency checks and penetration testing.
- Add database migration tooling before schema changes become frequent.
- Configure backups for PostgreSQL.

