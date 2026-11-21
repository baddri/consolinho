---
id: T-0115
title: Fleet administration details pages and cluster form — OCP heading, tabs, two-column details, user copy, form width
status: done
owner: frontend-engineer
checkpoint: CP3.5
depends_on: [T-0110, T-0114, T-0116]
paths: [web/src/features/admin/users/UserDetail*, web/src/features/admin/users/UserDetailsTab.tsx, web/src/features/admin/users/UserRoleLabels.tsx, web/src/features/admin/users/UserActionDialogs.tsx, web/src/features/admin/users/useUserActions.tsx, web/src/features/admin/users/adminSource.ts, web/src/features/admin/users/UserActions.test.tsx, web/src/features/admin/clusters/ClusterDetail*, web/src/features/admin/clusters/ClusterDetailsTab.tsx, web/src/features/admin/clusters/ClusterFormPage.tsx, web/src/features/admin/clusters/form, web/src/features/admin/adminTabs.ts, web/src/features/admin/admin.test.tsx]
review_rounds: 0
---

## Goal
Human ask (3): user and cluster details look like OCP details pages, use user language only, and the register/edit
cluster form is not full width.

## Scope
- In: `UserDetailPage`/`UserDetailHeader`/`UserDetailsTab`, `ClusterDetailPage`/`ClusterDetailHeader`/`ClusterDetailsTab`,
  `ClusterFormPage`/`ClusterForm`, user-facing copy in `UserActionDialogs`/`UserRoleLabels`.
- Out: Access/Credentials tab tables beyond heading/tab alignment (T-0114 rules apply if touched), modals (T-0116).

## Contract / design notes
Structure:
- Headers = `PageHeading` (T-0110): `breadcrumbs`, `title`, `status={<UserStatusLabel asLabel/>}` /
  `ClusterStatusLabel asLabel` (adapters converted in T-0114), `labels` = category labels (Admin, Read only,
  environment `EnvironmentLabel isCompact`), `actions`. Delete `UserBreadcrumb`. **Breadcrumbs decided**:
  `[{ label: 'Users', to: '/admin/users' }, { label: 'User details' }]`, `Clusters › Cluster details`,
  `Clusters › Register cluster` / `Clusters › Edit cluster`.
- Tabs: `PageTabs` driven by `adminTabs.ts` `USER_DETAIL_TABS` / `CLUSTER_DETAIL_TABS` (add a `title` + path per key
  there; keep the `as const` key arrays). Tab content in `PageBody`.
- Details tabs: `SectionHeading` + `DetailsGrid` / two `DetailsColumn` / `DetailsItem` (T-0110).
- One admin-source helper: new `users/adminSource.ts:adminSourceText(source: string | null): string` (`"user list"` →
  "Admin set in the deployment settings", `"group <g>"` → "Admin through group <g>", null → "Admin"). Replaces
  `UserDetailHeader.tsx:adminViaConfigurationLabel` (L21) and `UserRoleLabels.tsx:adminViaConfigurationText` (L14);
  callers: `UserDetailHeader` L47, `UserRoleLabels` L37 (tooltip), `useUserActions.tsx` L70 (also drop "Change the
  configuration to remove." → "Remove it in the deployment settings."), `UserActionDialogs.tsx` L110.
- Superseded spec text (note only): CP1 `docs/specs/CP1-identity-and-admin.md` L78 and L324 ("Admin via configuration",
  "Admin via config" badge, USR-6).

Findings:
- User details — "Read-only applies on every cluster regardless of grant mode (enforced by the proxy from CP2) and
  blocks admin changes for admins." — internal copy — "Read-only users can't change anything on any cluster or in
  Fleet administration." (same text as Add user modal).
- User details/header/list — "Admin via configuration (user list)" / "(group x)" / "granted by configuration" — internal —
  map the source: `user list` → "Admin set in the deployment settings"; `group <g>` → "Admin through group <g>"; one
  helper used by header, details, list and `UserActionDialogs.tsx:L110` (promote copy).
- User details — tabs offset from the heading, horizontal `DescriptionList` without a section title — `PageTabs`,
  `SectionHeading` "User details", `DetailsGrid` (left: Username, Display name, Role + source, Status, Read only; right:
  Created, Last login, Groups last seen, Cluster grants, Audit link).
- User header — breadcrumb "Users › alice" — OCP "Users › User details"; title = username, display name as subtitle;
  "Grant access to clusters" (secondary) + Actions right — keep, via `PageHeading`.
- Cluster details — horizontal terms wrap to 3 lines ("Connection settings changed") — `DetailsGrid` two columns
  (left: Display name, Environment, Description, Status, Web console; right: API URL, TLS, Credentials, Users with access,
  Connection settings changed, Created, Updated, Audit). Breadcrumb "Clusters › Cluster details". Env label compact,
  next to the title (today larger and misaligned).
- Register/edit cluster — fields span 1560 px at 1920 — `Form isWidthLimited` (55rem), `FormSection` h2 per group,
  `ActionGroup` Create/Save + Cancel link at the end; heading via `PageHeading` with breadcrumb "Clusters › Register cluster".
- Environment radio labels (Production + "prod" label) — fine; keep.

## Context pack
- Docs: `docs/architecture/UX.md` §3, §4, §6, §8, §11.
- Touch points: `web/src/features/admin/users/UserDetailHeader.tsx` (`adminViaConfigurationLabel` L21, `UserHeaderLabels`,
  `UserDetailHeader` L73), `web/src/features/admin/users/UserDetailPage.tsx` (tabs L127, page L164-193),
  `web/src/features/admin/users/UserDetailsTab.tsx` (`roleSources` L23-32, `UserDetailsTab` L45),
  `web/src/features/admin/users/UserRoleLabels.tsx:adminViaConfigurationText` (L14),
  `web/src/features/admin/users/UserActionDialogs.tsx:L21` (read-only copy) and `L110`,
  `web/src/features/admin/clusters/ClusterDetailHeader.tsx:ClusterDetailHeader`, `ClusterDetailPage.tsx:ClusterTabs` (L80-102),
  `ClusterDetailsTab.tsx:ClusterDetailsTab`, `ClusterFormPage.tsx` (L35-76), `form/ClusterForm.tsx:ClusterForm`,
  `form/ClusterFormSections.tsx`, `web/src/features/admin/adminTabs.ts`.
- Backend strings: source is `"user list"` or `"group <name>"` (`src/FleetConsole.Application/Auth/AdminConfigurationResolver.cs:L10`); mock `web/src/mocks/fixtures/users.ts:ADMIN_GROUP_SOURCE`.
- Tests: `UserDetailPage.test.tsx` L37 (crumb `alice` → "User details"; admin-source texts), `UserActions.test.tsx`
  (promote/read-only copy), `ClusterDetailPage.test.tsx` L97 (crumbs), `form/ClusterForm.test.tsx`, `admin.test.tsx`;
  add `adminSource.test.ts`. Convention: `renderApp` + `preloadLazyRoutes` + `setMockUser` (FRONTEND.md § "Testing").
- Conflicts: `UserRoleLabels.tsx` and status adapters with T-0114; `UserActions.test.tsx` and
  `ClusterDetailPage.test.tsx` (dialog assertions) with T-0116 — hence runs after both. Parallel-safe with T-0111…T-0113.
- OCP: `public/components/utils/details-page.tsx`, `public/components/utils/horizontal-nav.tsx`,
  `packages/console-shared/src/components/heading/PageHeading.tsx`.

## Acceptance criteria
- [x] (from T-0114 visual review) User access tab has one create entry point, not both "Grant access to clusters" in the heading and "Add access" in the toolbar; wording consistent with the cluster tab ("Grant access").
- [x] `/admin/users/admin`, `/admin/users/alice`, `/admin/users/ines`: no text contains "CP", "proxy", "configuration (",
      "user list"; source shows as "Admin set in the deployment settings" / "Admin through group fleetconsole-admins".
- [x] User and cluster details: two columns at 1280, terms above values, tabs aligned with the title, OCP breadcrumbs.
- [x] `/admin/clusters/new` and `/edit` at 1920: form ≤ 55rem wide, buttons at the end, both themes.
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-22 frontend-engineer: started; plan — adminSource helper, PageHeading/PageTabs/DetailsGrid on user+cluster details, cluster form width; user access tab: heading drops "Grant access to clusters" (still in Actions + empty state), toolbar "Add access" → "Grant access".
- 2026-11-22 frontend-engineer: done; check-fe green (728 tests); mock-UI screenshots light/dark × 1280/1920 checked (form 880 px = 55rem, no internal copy).

- 2026-11-22 frontend-engineer: review round 1 fixed — grant modal title, Credentials tab nowrap headers + "Add credential" right, Promote copy via `adminSourceReason`, fallback test, rewrap; check-fe green (729).

## Review
- 2026-11-22 frontend-architect, round 1: **CHANGES_REQUESTED** (code only; visuals by ux-designer). check-fe green, 728 tests.
  Accepted: `adminSource.ts` (prefix match on `"group "`, every other string → "deployment settings" is a safe
  user-language fallback); `adminTabs.ts:detailPageTabs` + `*_TAB_TITLES`; `Form isWidthLimited` (PF prop, 55rem
  token, no custom CSS); grants edits outside `paths` (needed for the T-0114 single-entry-point AC); `role="tabpanel"`
  on `PageBody` matches `ResourceDetailsPage`.
  Required (small, the engineer's own follow-ups):
  - `web/src/features/admin/grants/GrantFormModal.tsx:69` — title "Add cluster access for <user>" contradicts the new
    "Grant access" wording — use `Grant ${username} access to a cluster` (like the bulk wizard / cluster tab); update `GrantsTab.test.tsx` dialog names.
  - `web/src/features/admin/credentials/ClusterCredentialsTab.tsx:58` — "Rotated" header truncates at 1280 — `<Th modifier="nowrap">` (T-0114 table rules); check the other short headers there the same way.
  Optional nits:
  - `adminSource.test.ts` — add a case for an unknown source string to pin the fallback.
  - `UserActionDialogs.tsx:108` — "alice: Admin through group x." reads like a log line; e.g. "alice is an admin through group x." (UX may prefer).
  - `UserRoleLabels.tsx:12` — comment line 135 chars; rewrap.
  Backend follow-up (note only): `Users.AdminViaConfiguration` detail + `mocks/handlers/users.ts:162` still say "Admin granted by configuration (…)"; a structured source (`kind` + `group`) would remove the string parsing.
- 2026-11-22 frontend-architect, round 2: **APPROVE** — modal title, nowrap headers, `adminSourceReason` Promote copy,
  fallback test and comment rewrap all as required; no stale "Add cluster access" strings. "Add credential" `alignEnd` accepted (visuals: ux-designer).

### Visual review (ux-designer, 2026-11-22) — APPROVE
Mock UI, light+dark, 1280+1920: users admin/alice/ines (Details, Cluster access), cluster prod-eu-1 (Details,
Credentials, Access), register + edit cluster (scrolled to buttons), Add user, Promote/Demote dialogs.
- OK: no "CP"/"proxy"/"configuration ("/"user list" on any screen; sources read "Admin through group fleetconsole-admins" / "Assigned by an administrator".
- OK: breadcrumbs `Users › User details`, `Clusters › Cluster details|Register cluster|Edit cluster`; status as outlined compact label, env/Admin/Read only compact labels, Actions right (UX §3).
- OK: tabs directly under the heading, left-aligned with the title (OCP horizontal-nav); SectionHeading + two vertical DescriptionList columns at 1280 and 1920 (UX §6).
- OK: cluster form 880 px (55rem) at 1280 and 1920, FormSection headings, Register/Save + link Cancel at the end, both themes (UX §8).
- OK: user Cluster access tab has a single create entry point ("Grant access" in the toolbar, matching the cluster Access tab).
- Nit (copy, fix with the commit or fold into a follow-up) — Promote dialog for a configuration admin reads "admin: Admin through group fleetconsole-admins. Promoting…" — `UserActionDialogs.tsx:109` — "admin is already an administrator through group fleetconsole-admins (or: set in the deployment settings). Promoting records the role, so it is kept if the deployment settings change."
- Follow-up (already noted, T-0114 rules): cluster Credentials tab at 1280 truncates "Rota…" header and wraps Name/Service account; its "Add credential" sits left while the Access tabs put "Grant access" right — align with the Access tabs.

## Handover notes
- `users/adminSource.ts:adminSourceText` is the only admin-source text (details Role, Demote reason "… Remove it in the
  deployment settings.", Promote dialog); `adminViaConfiguration{Label,Text}` and `UserBreadcrumb` are gone.
- One create entry point on the user access tab: heading has only Actions (bulk wizard = its first item, plus the
  empty-state button); toolbar "Add access" → "Grant access" (`GrantsTab.tsx`, `GrantsTab.test.tsx`,
  `BulkGrantWizard.test.tsx` opens the wizard via Actions) — touched outside `paths` for that AC.
- `adminTabs.ts`: `USER_/CLUSTER_DETAIL_TAB_TITLES` + `detailPageTabs(keys, titles, basePath)` feed `PageTabs`.
- Headers: status as `asLabel` (cluster "Disabled" label replaced by the status); env + "TLS not verified" compact.
- Cluster form: `Form isWidthLimited`; Conflict/Problem alerts moved above the `ActionGroup` (UX §8).
- Round 1: `GrantFormModal` title `Grant <user> access to a cluster`; `ClusterCredentialsTab` headers nowrap,
  "Add credential" right-aligned; `adminSourceReason` gives the Promote phrase ("is already an administrator through …").
- Follow-ups: backend `Users.AdminViaConfiguration` detail and `mocks/handlers/users.ts:162` still say "Admin granted
  by configuration (…)" (structured source suggested); `CreateUserModal` duplicates `READ_ONLY_EXPLANATION` text.
