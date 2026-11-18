---
id: T-0035
title: Admin cluster detail page (/admin/clusters/:name) — header, Actions, Details tab, tab routing
status: todo
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
  aria-disabled while enabled). All with `useAdminAccess` reasons.
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
- [ ] CLU-8: header with env label; tabs reflect the URL; Actions items present with correct enabled/disabled state
      for an enabled vs disabled cluster.
- [ ] CLU-2: certificates rendered with expiry labels from fixtures (ok / expiringSoon / expired); empty and skip-TLS
      variants.
- [ ] Web console link opens externally with `rel="noopener noreferrer"`; audit link carries `?cluster=`.
- [ ] Enable/disable from the detail page updates header labels without reload (setQueryData).
- [ ] 404/error/loading states (QG-3). TSDoc. Build, lint, tests green.

## Work log

## Review

## Handover notes
