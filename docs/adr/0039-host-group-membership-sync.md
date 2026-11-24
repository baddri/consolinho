# 0039 — Host group membership: read through FleetConsole's host ServiceAccount, fail closed on revalidation
**Status:** Accepted (2026-11-24, backend-architect; CP4.5a design) · refines ADR-0034 §2/§5 and spec CP4.5 Q5 ·
extends ADR-0009 (session revalidation) · relies on ADR-0007 (OCP token discarded after login)

## Context
ADR-0034 makes group membership = `User.Groups`, refreshed by session revalidation (PREC-1). Spec Q5 proposed
re-reading `users/~` **with the user's token**, keeping the last groups if that fails. Two problems:
1. FleetConsole never keeps the user's OCP access token (ADR-0007, AUTH-3: it lives only inside `OnCreatingTicket`).
   There is no user token at revalidation time, and storing one would reverse a core security decision.
2. "Keep the last groups on failure" is fail-open for a revocation path: Sam removed from `sre-emea` keeps the
   group's clusters for as long as the host is unreachable. ADR-0009 fails closed when the basis of a session can't be
   read (`GetSessionStateQuery` failure → session rejected). The two conflict; we pick ADR-0009's behaviour.

ADR-0034 §5 already introduces FleetConsole's own host ServiceAccount (`get/list groups.user.openshift.io`) for the
group picker. The same read answers membership: on OpenShift, `users/~ .groups` is derived from `Group.users`.

## Decision
1. **One source: `IHostGroupDirectory`** (Application port, Infrastructure adapter). It lists
   `GET {Auth:OpenShift:HostApiServerUrl}/apis/user.openshift.io/v1/groups` (paged, `limit=500` + `continue`) with
   FleetConsole's host SA token, over the existing `openshift-host` client (same trust, no retries). It serves the
   group picker, the Groups pages and revalidation.
2. **Snapshot, fail-safe off.** The adapter keeps one process-wide snapshot (`name → users`), refreshed when older
   than `Auth:HostGroups:MaxSnapshotAge` (default **15 s**), single-flight. An older snapshot is **never** served: a
   failed refresh yields `Forbidden` (host 401/403) or `Unavailable` (anything else, or not configured). Worst-case
   lag of a host-side removal = `Auth:RevalidationInterval` + `MaxSnapshotAge` (≈ 75 s by default). (CP4.5b may move
   the snapshot into `HybridCache`; the port does not change.)
3. **Revalidation** (`SessionValidator`, after `GetSessionStateQuery` succeeds) dispatches the internal
   `SyncUserGroupsCommand`. Membership = snapshot groups whose `users` contain the username (ordinal), minus
   `system:*` (`OpenShiftGroups.WithoutVirtualGroups`).
   - Snapshot OK → `User.ReplaceGroups(...)` when the set changed (raises `UserGroupsChanged`, audited
     `user.groups_changed`, actor `system`); the check time is recorded either way.
   - Snapshot not OK → **fail closed where stale data could widen access**: if any of the user's *recorded* groups is
     the subject of a grant, the command fails (`Auth.GroupsUnavailable`) and the validator rejects the session, as
     ADR-0009 does for any failure. If none is (stale membership can't grant anything), the session continues
     unchanged. Logged with the reason, never with group lists.
   Login is unchanged: `CompleteLogin` keeps recording `users/~` groups and also records the check time.
4. **Check time outside the aggregate.** `User` has an `xmin` concurrency token; a timestamp written every interval
   per active user would make admin edits fail with stale versions. The "groups as of" time (EFF-4) is kept in a
   separate non-aggregate table `user_group_checks (user_id PK → users, checked_at)`, upserted through
   `IUserGroupCheckRecorder`. `User.Groups` itself changes only when membership changes.
5. **Credentials and RBAC.** Token from `Auth:HostGroups:TokenPath` (default `/var/run/secrets/fleetconsole/host/token`,
   re-read on every refresh because projected tokens rotate). In-cluster: a projected SA token volume mounted into the
   server container only (`automountServiceAccountToken` stays `false`), plus a `ClusterRole` with `get`/`list` on
   `groups` in `user.openshift.io` and a `ClusterRoleBinding` to the app SA — nothing else. If the host is not the
   cluster FleetConsole runs on, the overlay mounts a host SA token Secret at the same path. Development only:
   `Auth:HostGroups:Token` inline (refused elsewhere, like `SkipTlsVerify`); the DevOAuth emulator serves the groups
   list for that fake bearer token.

## Consequences
- PREC-1 holds without per-request host calls and without storing user tokens.
- A host API outage longer than `MaxSnapshotAge` signs out, at their next revalidation, the users whose recorded
  groups carry grants; users with only direct grants keep working. Login needs the host anyway.
- Installing FleetConsole now needs a cluster-scoped `ClusterRole`/`ClusterRoleBinding` (cluster-admin once).
- The SA can read every host group name and member list; only admins see them (`/api/admin/groups*`).
- Membership changes are audited, and `UserGroupsChanged` is the event that CP4.5b's cache invalidates
  `user:{id}` on.

## Alternatives rejected
- **Store the user's OCP token (encrypted) for revalidation**: reverses ADR-0007/AUTH-3 for little gain.
- **Keep last-known groups on failure** (Q5): fail-open on revocation; conflicts with ADR-0009.
- **Always reject on failure**: a host blip would sign out users whose access can't depend on groups.
- **Group sync job into a local table**: rejected in ADR-0034 (second source of truth).
