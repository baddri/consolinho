---
id: T-0263
title: Fleet administration › Groups — list page and group detail Details tab (GPG-1, GPG-2 details, GPG-4)
status: todo
owner: frontend-engineer
checkpoint: 4.5a
depends_on: [T-0260]    # lane B (groups); parallel with T-0261/T-0262 and T-0265; runs on mocks, BE T-0256
paths: [web/src/features/admin/groups/, web/src/features/admin/adminSections.ts, web/src/features/admin/adminTabs.ts, web/src/features/admin/routes.tsx, web/src/app/layout/AppShell.test.tsx, web/src/test/]
review_rounds: 0
---

## Goal
Admins see every group that matters — host groups and groups that only exist in grants — with member and cluster
counts, and open a group to see who is in it. Mirrors OCP's User Management › Groups list and Group details.

## Scope
- In: `Groups` admin section (after Users), list page, group detail page (heading, Details tab), routes, 404.
- Out: the Cluster access tab and bulk wizard (T-0264 adds the `access` tab key, its route and body).

## Contract / design notes
- Routes (add to `routes.tsx`; additive edits — T-0265 edits the same file):
  `/fleet/admin/groups` (`?q=`), `/fleet/admin/groups/:groupName` (Details, index). T-0264 adds
  `/fleet/admin/groups/:groupName/access`. `groupName` URL-encoded (`groupDetailPath`, T-0260).
- `adminSections.ts`: `{ id: 'groups', title: 'Groups' }` right after `users`.
- `adminTabs.ts`: `GROUP_DETAIL_TABS = ['details']`, titles `{ details: 'Details' }` (T-0264 appends `access: 'Cluster access'`);
  render `PageTabs` already so the page anatomy doesn't change when the second tab lands.
- `GroupsListPage`: `PageHeading` "Groups" (no create action — groups are host objects), `ConsoleDataView` with Name
  text filter (`?q=`), columns **Name** (`AdminResourceLink kind="Group"`, plus `Label isCompact` "Not found on host
  cluster" when `foundOnHost === false`), **Users** (`memberCount ?? '-'`; when null a tooltip "Member count unavailable:
  FleetConsole can't read groups on the host cluster." — Q7), **Clusters** (`clusterCount`). Default sort Name.
  `hostStatus !== 'ok'` → inline `Alert variant="warning" isInline` above the list: "Could not list groups on the host
  cluster. Only groups that have cluster access are shown." (+ "Last read <RelativeTime hostReadAt>" when set).
- GPG-4 empty (no items): `EmptyState` "No groups found", body "Groups appear here when they exist on the host
  cluster or have cluster access. FleetConsole's host service account needs permission to list groups
  (groups.user.openshift.io)."
- `GroupDetailPage`: breadcrumb `Groups › Group details`, heading = group name with `AdminResourceName kind="Group"`
  and the "Not found on host cluster" label; tabs via `PageTabs`. 404 `Groups.NotFound` → shared not-found state with a
  link back to Groups (mirror `users/UserDetailPage.tsx` gone handling).
- `GroupDetailsTab`: `SectionHeading` "Group details" + `DetailsGrid` (Name, Users count, Clusters count, Source:
  "Host cluster" / "Grants only"), then `SectionHeading` "Users" + compact `Table` of `members`: Name (link to
  `userDetailPath` when `isRegistered`, else plain text + `Label isCompact` "No FleetConsole user"), Display name, Status
  (`UserStatusLabel`). `members === null` → `EmptyState` (small) "Members unknown" + host hint; `[]` → "No users".
  No kebab (we don't edit host membership — §6 out of scope).

## Context pack
- Docs: `UX.md` § 3 Page heading, § 5 List pages, § 6 Details pages, § 10 Empty; `FRONTEND.md` § Routing (code-splitting convention in `routes.tsx` header), § Admin list pages.
- Exemplars: `users/UsersListPage.tsx` (ConsoleDataView list, L1-80), `users/userColumns.tsx` (columns + path helper), `users/UserDetailPage.tsx` (tabs, gone/404 handling, L94-166), `users/UserDetailsTab.tsx` (DetailsGrid).
- Touch points: `features/admin/routes.tsx:adminRoute`, `adminSections.ts:ADMIN_SECTIONS`, `adminTabs.ts:detailPageTabs/useAdminTab`, `groups/api.ts:useGroups/useGroup` (T-0260), `AdminResourceLink.tsx` (`Group` kind from T-0260), `app/layout/AppShell.test.tsx` L122 (Fleet administration section list — add Groups), `test/` `preloadLazyRoutes` list.
- OCP reference: `/home/bad/works/openshift-console/frontend/public/components/group.tsx:useGroupColumns` (L72-105, Name/Users/Created), `:GroupDetails` (L199-218, "Group details" + "Users" sections), `:UsersTable` (L171-196).

## Acceptance criteria
- [ ] GPG-1: sidebar Fleet administration shows Groups after Users; list has Name / Users / Clusters; grant-only group shows "Not found on host cluster"; `system:*` never listed; Name filter in the URL.
- [ ] Q7: unknown member count shows `-` with tooltip; `hostStatus` forbidden shows the warning alert and the grant-only groups.
- [ ] GPG-4: empty list shows "No groups found" with the host-permission hint.
- [ ] GPG-2 (Details): members table, registered users linked, unregistered labelled; unknown members state; unknown group → 404 page.
- [ ] Route-level code splitting kept (lazy page modules); deep link + reload of `/fleet/admin/groups/sre` works.
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
