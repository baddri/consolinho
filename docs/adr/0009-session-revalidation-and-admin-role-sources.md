# 0009 — Cookie session revalidation, security stamp, and admin role sources
**Status:** Accepted (2026-11-18) · **Refines:** 0007

## Context
ADR-0007 fixes login (host-cluster OpenShift OAuth) and a FleetConsole cookie session. CP1 adds:
- AUTH-11: sessions revalidated against the DB at least every 60 s; deactivation → next call after the interval is 401;
  role / read-only changes take effect without re-login.
- AUTH-8 / USR-6 / Q8: admins can come from configuration (`Auth:BootstrapAdminUsers`, `Auth:AdminGroups`), evaluated
  **at login only**, and the UI must tell config-sourced admins apart; removing someone from the admin group demotes
  them at next login *unless an admin promoted them explicitly*.
- HANDOVER: replace the temporary `IRequireRole.RequiredRole: string` and `ICurrentUser.UserId: Guid?`.

## Decision

### Session
- ASP.NET Core cookie authentication, scheme `Cookies` (constant `SessionDefaults.Scheme`). Cookie name
  `FleetConsole.Session`, `HttpOnly`, `SameSite=Lax`, `SecurePolicy=Always` except Development
  (`SameAsRequest`, for the plain-http dev profile), `ExpireTimeSpan = Auth:SessionLifetime` (default 8 h),
  `SlidingExpiration = true`. Ticket protected by Data Protection (key ring persisted in Postgres, ADR-0004).
- For `/api` the cookie handler never redirects: `OnRedirectToLogin` → 401, `OnRedirectToAccessDenied` → 403, both
  written as ProblemDetails (`code` `Auth.Unauthenticated` / `Auth.Forbidden`).
- **Claims** (built only by `SessionPrincipalFactory`, read only by `HttpCurrentUser`):
  `fc:uid` (UserId Guid), `name` (username), `role` (`admin`/`user`), `fc:ro` (`true`/`false`), `fc:stamp`
  (security stamp). No groups, no OCP token.
- **Revalidation** in `CookieAuthenticationEvents.OnValidatePrincipal` (`SessionValidator`): the time of the last check
  is stored in `AuthenticationProperties.Items["fc.validated"]`. When older than `Auth:RevalidationInterval`
  (default 60 s) it dispatches `GetSessionStateQuery(UserId)`:
  - user missing, deactivated, or stamp ≠ `fc:stamp` → `RejectPrincipal()` + `SignOutAsync` → the request continues
    anonymous → 401 on protected endpoints;
  - otherwise the principal is rebuilt from current DB values (role, read-only, username), `fc.validated` = now,
    `ShouldRenew = true`.
  `GetSessionStateQuery` is **not** `IRequireAuthenticated` (it runs before `HttpContext.User` is set); it is never
  mapped to an endpoint.
- **Security stamp:** `User.SecurityStamp` (Guid), rotated by `Deactivate()`. Reactivation does not restore it, so
  sessions that existed before a deactivation never come back. Future "sign out everywhere" = rotate the stamp.
- Consequence accepted: between checks a session acts on ≤ 60 s old role/read-only claims. Admin last-admin checks
  (ADM-5) always read the DB.

### Admin role sources (Q8)
`User` stores two independent facts; the effective role is derived:
- `IsAdminByAssignment` (bool) — set by an admin via promote, cleared by demote;
- `AdminConfigurationSource` (string?) — recomputed at **every login** from config: `"user list"` when the username is
  in `Auth:BootstrapAdminUsers`, `"group <name>"` for the first matching `Auth:AdminGroups` entry, else `null`;
- `Role => IsAdminByAssignment || AdminConfigurationSource is not null ? UserRole.Admin : UserRole.User`.
Rules: demote is refused (409 `Users.AdminViaConfiguration`) while `AdminConfigurationSource` is set; when a login
changes the effective role, `User.RecordLogin` raises `UserRoleChanged` with source `Configuration`, audited with actor
`system (config)`. Effective role is not persisted as a column; read-model projections compute it in SQL.

### Typed identity in the Application layer
- `IRequireRole.RequiredRole` becomes `UserRole` (Domain `Users/UserRole`). New marker `IAdminRequest : IRequireRole`
  supplies `RequiredRole => UserRole.Admin` as a default interface implementation; every admin command/query
  implements `IAdminRequest` (admin commands also `IMutatingCommand`).
- `ICurrentUser`: `UserId? UserId`, `string? Username`, `bool IsReadOnly`, `bool IsInRole(UserRole role)`,
  `bool IsAuthenticated`.

### Known gap, accepted
The last-admin rule (ADM-5) counts admins and then saves without a serializing lock, so two admins demoting each other
concurrently could both succeed. With 2–4 admins this is unlikely, and configuration admins
(`Auth:BootstrapAdminUsers`) are the documented recovery path. Revisit if it ever happens.

## Consequences
- Deactivation is effective within `RevalidationInterval`, without a DB read on every request.
- One cookie re-issue per interval per active user (sliding renewal) — negligible.
- The admin UI can show "Admin via configuration (group X)" exactly as computed at the user's last login (USR-6).
