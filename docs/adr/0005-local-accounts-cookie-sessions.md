# 0005 — Local accounts with cookie sessions; OIDC later
**Status:** Accepted (2026-11-18)

## Context
Admins manage users in the console itself. SSO may come later.

## Decision
Local users in Postgres, `PasswordHasher<User>`, ASP.NET cookie authentication (BFF style — no tokens in the browser). User identity reaches the Application layer only through `ICurrentUser`, so an OIDC login can be added without touching use cases.

## Consequences
We own password reset/admin-set password flows. CSRF handled per SECURITY.md.
