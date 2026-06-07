# Security Baseline

This project is prepared for production hardening, but final deployment must use real secrets and HTTPS.

## Implemented

- BCrypt password hashing.
- Stateless bearer authentication.
- Server-side active-session validation.
- Duplicate login confirmation flow.
- Previous token invalidation after confirmed force login.
- Five failed password attempts lock the account for five minutes.
- Production profile startup guard blocks the default or weak token secret.
- Default development account seeding is disabled unless explicitly enabled for local development.
- Caddy, Nginx, and API security headers for content sniffing, frame blocking, referrer policy, and browser permission policy.
- CORS allow-list through environment variables.
- Family-scoped access services for protected data.
- PostgreSQL backup and restore scripts for Docker deployments.
- Production update script with backup, deploy, and health checks.
- Ubuntu hardening script for firewall, swap, Docker log rotation, and unattended security updates.
- Production configuration validator for secrets, CORS, compose, and Caddy checks.

## Before Public Launch

- Use HTTPS only.
- Replace all default secrets.
- Do not enable `app.seed-default-account` in production.
- Keep `.env.production` out of Git.
- Run dependency checks and penetration testing.
- Schedule automatic PostgreSQL backups and restore drills.
