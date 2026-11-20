---
id: T-0032
title: Admin user detail page (/admin/users/:username) — header, Details tab, tab routing
status: done
owner: frontend-engineer
checkpoint: 1
depends_on: [T-0031]
paths: [web/src/features/admin/users/]
review_rounds: 2
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
- [x] USR-7 Details: all fields for `alice`; `admin` shows "Admin via configuration (group fleetconsole-admins)".
- [x] Tabs are URL-driven: `/admin/users/alice/access` selects Cluster access; switching tabs updates the URL.
- [x] "View audit entries" links to `/admin/audit?user=alice`.
- [x] Actions dropdown has the same items/disabled reasons as the list (shared hook; one test is enough).
- [x] Username with `:`/`@` loads (MSW asserts encoded path). 404 and error states (QG-3).
- [x] TSDoc. Build, lint, tests green.

## Work log
- 2026-11-20 frontend-engineer: started; implemented page, header (labels, breadcrumb, Actions dropdown via
  `useUserActions`), Details tab, URL tabs, 404/error/loading states; 7 tests in `UserDetailPage.test.tsx`.
  Updated user-detail rows of `app/router.test.tsx` (placeholder gone). Dropped dead `ConflictAlert` (T-0031 nit).
  `scripts/check-fe.sh` green (376 tests).
- 2026-11-20 round 1 fixes: header skeleton only while pending (404/error tests assert it's gone); Role reads
  "Administrator — granted by configuration (…)"; tab bar in `PageSection type="tabs"`, active panel in a
  `TabContent` below. `scripts/check-fe.sh` green (383 tests).

## Review
- 2026-11-20 frontend-architect, round 1: **CHANGES_REQUESTED**. `scripts/check-fe.sh` green (33 files / 383 tests).
  - REQUIRED `web/src/features/admin/users/UserDetailHeader.tsx:73-80` — the header shows the skeleton whenever
    `user` is undefined, so on 404/other errors it keeps showing "Loading user details" (visible and announced to
    screen readers) next to the not-found/error state — pass `isPending` (or a `loading` prop) and render the skeleton
    only while pending; add an assertion to the 404 test that no "Loading user details" text remains.
  - nit `UserDetailsTab.tsx:49` — Role reads "Administrator (Admin granted by configuration (group …))" (nested
    parens, repeats "Admin"); consider "Administrator — granted by configuration (group …)". Header/Details wording
    split itself is acceptable (header label is the spec's text; tooltip keeps the USR-6 sentence).
  - nit `UserDetailPage.tsx:51` — PF6 idiom for page-level tabs is `<PageSection type="tabs">` wrapping `Tabs`.
  - OK: URL-derived tab + `mountOnEnter/unmountOnExit`, encoded username (test asserts the encoded path), 404 vs
    error split with Retry, `useUserActions` reuse, no `any`, TSDoc, router.test rows, dead `ConflictAlert` removal.

- 2026-11-20 frontend-architect, round 2: **APPROVE**. Users + router tests green (4 files / 51; ran scoped because
  other agents are editing concurrently; engineer reports full check green).
  - Fixed: header skeleton only while `isLoading`; 404 test asserts no "Loading user" text; Role wording; tab bar in
    `PageSection type="tabs"`.
  - Tab a11y OK: each `Tab` has `tabContentId` → `aria-controls`, which matches the `TabContent` `id` (role tabpanel,
    named by `aria-label` = the tab title). The inactive tab's `aria-controls` points to an unmounted panel; that's
    allowed for `aria-selected="false"` tabs.
  - nit (optional) `UserDetailPage.tsx:98` — could name the panel with `aria-labelledby` = the tab's id instead
    of repeating the title in `aria-label`; fine as is.

## Handover notes
- Files: `UserDetailPage.tsx` (page, `UserTabs`, `UserNotFound`), `UserDetailHeader.tsx`, `UserActionsDropdown.tsx`,
  `UserDetailsTab.tsx` (+ exported `userAuditPath`), `UserDetailPage.test.tsx`.
- Cluster access tab is a placeholder EmptyState in `UserTabPanel` (`UserDetailPage.tsx`); T-0039 replaces it. Only
  the active panel is mounted (URL-driven `TabContent`), so the grants query only runs on that tab. T-0040 adds its item via `useUserActions`.
- Header label: "Admin via configuration (<source>)"; Details role: "Administrator — granted by configuration
  (<source>)"; Demote tooltip keeps USR-6's "Admin granted by configuration (...)" (`adminViaConfigurationText`).
- Out-of-path edit: `web/src/app/router.test.tsx` user-detail rows now assert the username `h1` (separate `it.each`).
- Detail tests locate the `<dl>` via `findByLabelText('User details', { selector: 'dl' })` (dl has no list role).
