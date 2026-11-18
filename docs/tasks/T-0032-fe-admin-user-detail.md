---
id: T-0032
title: Admin user detail page (/admin/users/:username) — header, Details tab, tab routing
status: todo
owner: frontend-engineer
checkpoint: 1
depends_on: [T-0031]
paths: [web/src/features/admin/users/]
review_rounds: 0
---

## Goal
One page that answers "who is this user and what can they do" (USR-7, USR-5, USR-6), with tabs Details and Cluster
access (content of the latter: T-0039). Backend counterpart: T-0016; MSW until then. **Parallel group F7** (with T-0036).

## Scope
- In: `UserDetailPage.tsx`, `UserDetailsTab.tsx`, header + Actions dropdown (reusing `useUserActions`), tab routing.
- Out: Cluster access tab content (T-0039), bulk grant button (T-0040).

## Contract / design notes
Endpoint `GET /api/admin/users/{username}` → `UserDetail` (404 `Users.NotFound`). Key `adminKeys.user(username)`.
- Route param decoded by the router; API call re-encodes (`encodeURIComponent`) — test with `system:admin`-like
  names containing `:` and `@` (ADR-0013 §1).
- Header (`PageSection`): `Title` username, display name below, labels: Admin, "Admin via configuration
  (`<source>`)" , Read only, Deactivated / Pending; Actions `Dropdown` (`useUserActions`); breadcrumb Users › name.
- Tabs (`Tabs` with `TabTitleText`, `isNav`-style links or `onSelect` → `navigate`): Details (`/admin/users/:u`),
  Cluster access (`/admin/users/:u/access`) — renders a placeholder until T-0039.
- Details tab `DescriptionList`: role (+ source), status, read-only with the USR-5 explanation text, display name,
  created (`RelativeTime`) by `createdBy`, last login, groups last seen (`LabelGroup`, all), number of cluster
  grants; link "View audit entries" → `/admin/audit?user=<username>` (USR-7).
- States: skeleton header/body while loading; 404 → EmptyState "User `x` not found" + back to Users; other errors →
  `ErrorState` with retry.

## Acceptance criteria
- [ ] USR-7 Details: all fields for `alice`; `admin` shows "Admin via configuration (group fleetconsole-admins)".
- [ ] Tabs are URL-driven: `/admin/users/alice/access` selects Cluster access; switching tabs updates the URL.
- [ ] "View audit entries" links to `/admin/audit?user=alice`.
- [ ] Actions dropdown has the same items/disabled reasons as the list (shared hook; one test is enough).
- [ ] Username with `:`/`@` loads (MSW asserts encoded path). 404 and error states (QG-3).
- [ ] TSDoc. Build, lint, tests green.

## Work log

## Review

## Handover notes
