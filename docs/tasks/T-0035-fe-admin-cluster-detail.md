---
id: T-0035
title: Admin cluster detail page (/admin/clusters/:name) — header, Actions, Details tab, tab routing
status: done
owner: frontend-engineer
checkpoint: 1
depends_on: [T-0033, T-0034]
paths: [web/src/features/admin/clusters/]
review_rounds: 0
---

## Goal
The cluster's home in the admin area (CLU-8, CLU-2, CLU-3): everything about its connection settings, the CA
certificates in plain words, and tabs for Credentials (T-0036) and Access (T-0039). Backend counterpart: T-0017; MSW
until then. **Parallel group F6** (with T-0031).

## Scope
- In: `ClusterDetailPage.tsx`, `ClusterDetailsTab.tsx`, `CaCertificatesTable.tsx`, header + Actions dropdown.
- Out: Credentials tab content (T-0036), Access tab content (T-0039), Test connection action (T-0038).

## Contract / design notes
Endpoint `GET /api/admin/clusters/{name}` → `ClusterDetail` (404 `Clusters.NotFound`). Key `adminKeys.cluster`.
- Header: `Title` name + `EnvironmentLabel` + "Disabled" label + "TLS not verified" warning label; display name
  below; breadcrumb Clusters › name. Actions `Dropdown`: Edit, Enable/Disable (dialogs from T-0033 — they take the
  loaded `ClusterDetail` so no extra fetch), Test connection (slot, hidden until T-0038), Delete (T-0033 dialog;
  aria-disabled while enabled). All with `useAdminAccess` reasons. Reuse the T-0033 mutation hooks unchanged: they
  invalidate `accessibleClustersQueryKey` (`@/features/cluster-context`) on success (T-0029 review) — do not
  bypass them with a local `useMutation`, and keep that invalidation alongside the `setQueryData` header update.
- Tabs, URL-driven: Details (`/admin/clusters/:name`), Credentials (`…/credentials`, placeholder until T-0036),
  Access (`…/access`, placeholder until T-0039).
- Details tab (`DescriptionList`): display name, environment, API URL (`ClipboardCopy isReadOnly variant="inline-
  compact"`), web console URL (external link, `target="_blank" rel="noopener noreferrer"`, `ExternalLinkAltIcon`),
  description, TLS mode, status, credentials / users with access counts, connection settings changed (`RelativeTime`),
  created/updated by + at, link "View audit entries" → `/admin/audit?cluster=<name>`.
- `CaCertificatesTable` (CLU-2): subject, issuer, valid until (`RelativeTime` future), expiry `Label` (warning
  "Expires soon" / danger "Expired"), SHA-256 fingerprint (monospace, truncated with tooltip). Empty → "No CA bundle —
  the system trust store is used." Skip TLS → warning `Alert` "TLS verification is disabled for this cluster."
- States: skeleton, 404 EmptyState "Cluster `x` not found" + back, `ErrorState`.

## Acceptance criteria
- [x] CLU-8: header with env label; tabs reflect the URL; Actions items present with correct enabled/disabled state
      for an enabled vs disabled cluster.
- [x] CLU-2: certificates rendered with expiry labels from fixtures (ok / expiringSoon / expired); empty and skip-TLS
      variants.
- [x] Web console link opens externally with `rel="noopener noreferrer"`; audit link carries `?cluster=`.
- [x] Enable/disable from the detail page updates header labels without reload (setQueryData) and invalidates
      `accessibleClustersQueryKey` (switcher).
- [x] 404/error/loading states (QG-3). TSDoc. Build, lint, tests green.

## Work log
- 2026-11-20 frontend-engineer: started; detail page from T-0032 exemplar, reusing T-0033 dialogs/hooks.
- 2026-11-20 frontend-engineer: page, header, Actions dropdown, Details tab, CA table, placeholders for Credentials/Access; folded in T-0033 "cluster no longer exists" follow-up (list + detail). `scripts/check-fe.sh` green (430 tests).

## Review
**Round 1 — frontend-architect — APPROVE.** `scripts/check-fe.sh` green (37 files / 430 tests). URL-driven tabs,
PF6 page-tabs idiom, 404 handling (one toast guarded by ref, `replace` navigate, no loop), `useClusterActions`
options object (both call sites updated), T-0033 hooks reused unchanged, TSDoc, no `any`/casts, strong tests.
Optional nits / follow-ups:
- nit `ClusterDetailHeader.tsx:44`, `CaCertificatesTable.tsx:16-17` — `Label` gets both `color` and `status`; PF6 `status` overrides `color` — drop `color` where `status` is set.
- nit `ClusterDetailHeader.tsx:43` vs `CaCertificatesTable.tsx:66` — "TLS not verified" keyed on `tlsMode === 'skipVerify'`, the alert on `skipTlsVerify`; use one field (`tlsMode`) for both.
- follow-up `users/UserDetailPage.tsx:127` — renders `ErrorState`/404 next to loaded data on a failed background refetch; align with this page (`error && !data`, 404-after-load → toast + back to list). File a small task.

## Handover notes
- Files: `ClusterDetailPage.tsx` (tabs, states, `useLeaveDeletedCluster`), `ClusterDetailHeader.tsx`,
  `ClusterActionsDropdown.tsx`, `ClusterDetailsTab.tsx`, `CaCertificatesTable.tsx`, `useClusterGone.ts`; tests in
  `ClusterDetailPage.test.tsx` (13) + one list-kebab test in `ClusterActions.test.tsx`.
- `useClusterActions(cluster, { onDeleted, onGone })` now takes an options object; the 3 lifecycle modals accept
  `onGone`. On 404 they close and call `onGone` (detail: toast once + navigate to list) or toast themselves (list).
- Detail page: a background refetch failure keeps the loaded data (ErrorState only when nothing is loaded); a 404
  after data was loaded = deleted meanwhile → toast + `navigate('/admin/clusters', { replace: true })`.
- Credentials / Access tabs are EmptyState placeholders with counts (`ClusterTabPanel`) — T-0036 / T-0039 replace
  them. Test connection item: add in `useClusterActions` (T-0038); the dropdown renders whatever items it gets.
- API mock certificates are always `ok`; the expiry-label test overrides the GET with an inline `ClusterDetail`.
- `router.test.tsx`: cluster-detail rows moved to the title-only table (heading = cluster name).
