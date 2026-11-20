# 0017 — Promote always records the admin assignment
**Status:** Accepted (2026-11-18) · **Refines:** 0009

## Context
ADR-0009 gives `User` two admin sources: `IsAdminByAssignment` (set by promote, cleared by demote) and
`AdminConfigurationSource` (recomputed at each login from `Auth:BootstrapAdminUsers` / `Auth:AdminGroups`). The
effective role is Admin when either is set. A user who is admin by assignment stays admin when they leave the configured
admin group.

The first T-0007 design treated "promote to the current effective role" as a no-op. That made promoting a user who is
admin **only** through configuration do nothing: `IsAdminByAssignment` stayed false, so the user was demoted at their
next login after leaving the group, even though an admin had explicitly promoted them. The engineer flagged this
during T-0007, and the orchestrator ruled on the product question: an explicit promote must stick.

## Decision
- `User.ChangeRole(UserRole.Admin, ...)` sets `IsAdminByAssignment = true` whenever it is false, also when the user
  is already admin through configuration. It is a no-op (success, no event) only when `IsAdminByAssignment` is
  already true.
- Recording the assignment is an admin action and is audited even though the effective role stays Admin. It raises
  `UserRoleChanged(OldRole: Admin, NewRole: Admin, Source: Manual, ConfigurationSource: <current source>)`, which
  is audited as `user.promoted` with details `{ "source": "manual", "configurationSource": "group …" }`.
- **`UserRoleChanged.ConfigurationSource`:** for `Source == Manual` it is the user's `AdminConfigurationSource` at
  the time of the change. It is non-null only in this "promote a config admin" case, because demote is refused while
  the source is set. For `Source == Configuration` it is unchanged from ADR-0009/T-0007: the source responsible (the new
  one on promotion, the former one on demotion).
- `ChangeRole(UserRole.User, ...)` is unchanged. It is a no-op when the effective role is already User. Otherwise the
  checks run in this order: `AdminViaConfiguration`, then `SelfChange`, then `LastAdmin`. While configuration makes
  the user admin, the assignment cannot be cleared, so a promoted config admin who should lose the role must first
  leave the group and log in once, or be demoted after that.
- **API:** `UserListItemDto` and `UserDetailDto` expose `IsAdminByAssignment` (JSON `isAdminByAssignment`), so the
  UI can offer **Promote** on an Admin who is admin via configuration but not by assignment, and can show both sources.
  The endpoint stays `PUT /api/admin/users/{username}/role` with `{ "role": "admin", "version": n }`.

## Consequences
- Promote means the same thing in every case: "this user is an admin regardless of configuration". Admins don't need to
  know how configuration currently treats the user.
- `UserRoleChanged` can now have `OldRole == NewRole`. Audit and other consumers must pick the action from
  `NewRole` (Admin → `user.promoted`, User → `user.demoted`), not from the change in role.
- The UI needs one more field and an extra menu state (Promote shown for config-only admins). This is a shared contract
  change, so the frontend regenerates types.
