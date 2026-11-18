# 0007 — Login via the host cluster's OpenShift OAuth server
**Status:** Accepted (2026-11-18) · **Supersedes:** 0005

## Context
Requirement from the team: users log in to FleetConsole with **OpenShift OAuth of the host cluster** (the cluster
FleetConsole is deployed on), the same identity they use for the OCP console. FleetConsole still decides *what* they can
reach on the ~40 managed clusters through its own grants and SA credentials.

OpenShift's OAuth server is plain OAuth 2.0 (not OIDC): no ID token. Identity comes from calling the host API server
`GET /apis/user.openshift.io/v1/users/~` with the user's access token (returns `metadata.name` and `groups`).

## Decision
- **Flow:** OAuth 2.0 authorization code (+ PKCE) handled server-side by the Api (ASP.NET Core `AddOAuth` handler, BFF
  style). Endpoints discovered from `{hostApiServer}/.well-known/oauth-authorization-server`. Scope `user:info` only.
- **Identity:** after the code exchange, the Api calls `users/~` on the host API server, then **discards the OCP access
  token** — it is never stored or used for anything else. FleetConsole issues its own cookie session (`HttpOnly`,
  `Secure`, `SameSite=Lax` — Lax is required for the OAuth redirect back; CSRF stays covered by the `X-Console-Request` header).
- **OAuth client in production:** a ServiceAccount used as OAuth client (`serviceaccounts.openshift.io/oauth-redirecturi.fleetconsole`
  annotation) — namespaced, no cluster-admin needed. Client id `system:serviceaccount:<ns>:<sa>`, secret = that SA's token. A cluster-scoped
  `OAuthClient` is the documented alternative.
- **Users in FleetConsole:** keyed by OCP username. First successful login auto-provisions a `User` (role `User`, no
  grants → sees "no clusters assigned, ask an admin"). Config `Auth:AutoProvision=false` switches to admin-pre-created users only.
  OCP groups from `users/~` are stored on the session (and last-seen on the user) for later group-based grants.
- **Admin role:** stored on the `User`, editable by admins in the admin UI; bootstrapped from config
  `Auth:BootstrapAdminUsers` / `Auth:AdminGroups` (members are admin on login).
- **Deactivation:** an admin can deactivate a FleetConsole user; sessions are revalidated against the DB (security stamp), so
  it takes effect within minutes even though the OCP account still works.
- **Abstraction:** identity reaches the Application layer only via `ICurrentUser`; the OCP specifics live in
  `Infrastructure/Identity/OpenShiftOAuth*` behind an `IExternalIdentityClient` port.
- **Development:** `src/FleetConsole.DevOAuth` — a tiny in-repo ASP.NET minimal API that **emulates the OpenShift OAuth
  endpoints** (`/.well-known/oauth-authorization-server`, `/oauth/authorize` with a user picker page, `/oauth/token`,
  `/apis/user.openshift.io/v1/users/~`) with users/groups from its appsettings (e.g. `admin` in `fleetconsole-admins`,
  `alice`, `bob`). Wired into the AppHost; never deployed. This keeps dev and prod on the identical code path.
  Integration tests use the same emulator in-process.

## Consequences
- No passwords stored in FleetConsole; no password reset flows.
- The host cluster's OAuth server availability gates logins (existing sessions continue).
- Removing someone from OCP doesn't remove FleetConsole access to managed clusters until their session expires or an
  admin deactivates them — keep session lifetime modest (8h) and revalidate.
