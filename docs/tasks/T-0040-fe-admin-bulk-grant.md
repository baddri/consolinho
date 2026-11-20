---
id: T-0040
title: Bulk grant wizard — grant one user many clusters (all-or-nothing)
status: done
owner: frontend-engineer
checkpoint: 1
depends_on: [T-0039, T-0031]
paths: [web/src/features/admin/grants/bulk/, web/src/features/admin/users/, web/src/features/admin/grants/TypeaheadSelectField.tsx, web/src/features/admin/grants/CredentialPicker.tsx, web/src/features/admin/grants/GrantsTab.tsx, web/src/features/admin/grants/GrantFormModal.tsx, web/src/features/admin/grants/grantText.ts, web/src/features/admin/audit/TypeaheadFilter.tsx, web/src/shared/ui/TypeaheadSelect.tsx, web/src/shared/ui/TypeaheadSelect.test.tsx, web/src/shared/ui/index.ts]
review_rounds: 0
---

## Goal
Onboard an SRE to 30 clusters in one action (US-8, GRANT-4) and offer it right after pre-creating a user (USR-2).
Backend counterpart: T-0019; MSW until then. **Parallel group F9.**

## Scope
- In: `grants/bulk/` (`BulkGrantWizard`, step components, `pickCredential` pure function, zod schema), entry points
  on user detail (header button + Cluster access empty state), user list/detail action item "Grant access to
  clusters", `CreateUserModal` secondary "Create and grant access".
- Out: bulk for many users / re-assign (backlog).

## Contract / design notes
Endpoint `POST /api/admin/users/{username}/grants/bulk` (`BulkGrantRequest { accessMode, items: [{ clusterName,
credentialId }] }`, 1–100 items) → 200 `Grant[]`; 400 field errors keyed `items[i].clusterName` /
`items[i].credentialId` (indexes = request order) or `items`/`""`. Data: `GET /api/admin/clusters`,
`GET /api/admin/credentials` (one request for all clusters' credentials, filter by `clusterName`),
`GET /api/admin/users/{username}/grants`.
- `BulkGrantWizard({ username, isOpen, onClose })` — PF6 `Wizard` inside `Modal variant="large"`, title "Grant
  `alice` access to clusters". RHF form state `{ clusters: string[]; accessMode; preferredCredentialName; items:
  { clusterName; credentialId: string | '' }[] }`.
  1. **Select clusters** — checkbox `Table` (select all visible), columns name + `EnvironmentLabel`, status, credential
     count; text + env filters (local state, not URL — it's a modal); clusters with an existing grant are
     non-selectable with "already has access"; clusters without credentials non-selectable with "no credentials".
  2. **Access mode** — radio Read only (default) / Read write; optional "Preferred credential name" text (e.g.
     `fleet-view`).
  3. **Review** — one row per selected cluster: env label (production rows highlighted, e.g. `isRowSelected`-style
     or a warning label), `CredentialPicker` per row (from T-0039) pre-filled by `pickCredential(credentials,
     preferredName)`: the only credential, else the one whose `name === preferredName`, else empty. Footer "Grant
     access" disabled while any row lacks a credential (GRANT-4); RW with any production row → warning "This user will
     be able to change production clusters: prod-eu-1, prod-us-1."
- Submit: map selected rows in display order to `items`; server item errors via `applyServerErrors` onto
  `items.<i>.*` so the failing rows show inline errors and the wizard jumps to Review; nothing is created on error
  (server all-or-nothing). Success: toast "Granted alice ReadOnly on 12 clusters", close, invalidate
  `adminKeys.all` and `accessibleClustersQueryKey` (import from `@/features/cluster-context`, never the literal) (T-0029 review; covers an admin bulk-granting
  themselves).
- Entry points: user detail header button "Grant access to clusters" and Cluster access tab empty state;
  `useUserActions` item (T-0031 placeholder) now visible; `CreateUserModal` "Create and grant access" → after create
  navigates to `/admin/users/<u>/access` with router state `{ openBulkGrant: true }` which opens the wizard once.
- All entry points aria-disabled for read-only admins.

## Acceptance criteria
- [x] GRANT-4: select 3 clusters (one already granted shown disabled), choose mode, review pre-fills credentials by
      single-credential and preferred-name rules; submit blocked until every row has a credential; POST body lists
      items in order with CSRF header; success toast and grants appear on the tab; `accessibleClustersQueryKey`
      invalidated.
- [x] Production rows highlighted; RW + production warning lists the clusters.
- [x] MSW 400 with `items[1].credentialId` marks row 2 inline and keeps all selections; no grants created.
- [x] `pickCredential` unit tests. USR-2: "Create and grant access" opens the wizard for the new user.
- [x] Keyboard: wizard navigable, table checkboxes labelled per cluster. TSDoc. Build, lint, tests green.

## Work log
- 2026-11-20 frontend-engineer: started; shared typeahead consolidation + bulk wizard.
- 2026-11-20 frontend-engineer: `shared/ui/TypeaheadSelect` (aria-controls) behind grants field + audit filter; bulk wizard
  (`grants/bulk/`), entry points (header, empty state, user menu, "Create and grant access"); `check-fe.sh` green (504 tests).

## Review
- 2026-11-20 frontend-architect, round 1: **APPROVE**. Scoped vitest (11 files/118), typecheck, eslint green.
  Verified: `items[i].*` → `items.i.*` via `toFormPath` + `isLeafField`, row ref focus; invalidates `adminKeys.all` +
  `accessibleClustersQueryKey`; RW+prod warning; entry points aria-disabled (ADM-2); combobox `aria-controls` /
  `aria-activedescendant` hit PF `role="option"` buttons; audit/grant typeahead tests unchanged and green.
  Nits (optional):
  - `grants/bulk/ReviewStep.tsx:239` — `Tr isRowSelected` reads as "selected" in PF; a `pf-m-warning`-style row
    modifier or warning label would match intent better (spec allows either).
  - `grants/bulk/BulkGrantWizard.tsx:166` — no client cap at 100 items (contract max); harmless at ~40 clusters,
    server 400 lands in the alert.
  - `users/UserDetailHeader.tsx:649` + `useUserActions.tsx:60` — detail page offers the action twice (header + menu),
    each with its own wizard instance; as specified, but consider hiding the menu item on the detail page later.

## Handover notes
- Shared typeahead lives in `shared/ui/TypeaheadSelect.tsx` (not `shared/forms`): the audit filter isn't form-bound. Callers own
  input text + filtering; it owns open/highlight/keyboard/ARIA. `grants/TypeaheadSelectField` is now a thin RHF adapter.
- `CredentialPicker.tsx` now exports `CredentialSelect` (credentials passed as data); the grant dialog wraps it with the
  per-cluster query, the bulk review with the one fleet query grouped by cluster.
- `ACCESS_MODE_OPTIONS` moved from `GrantFormModal` to `grantText.ts`; added `bulkGrantedText`, `productionClustersWriteWarning`.
- Wizard: items rebuilt on entering Review (`onStepChange`), kept while the preferred name is unchanged, else
  `pickCredential`. Rows follow the admin clusters list order (name), not click order. Server `items[i].*` errors show on row i.
- Wizard owners: `UserDetailPage` (header button, empty-state button, router state `{ openBulkGrant: true }` — cleared with
  `replace` so reload doesn't reopen) and `useUserActions` (menu item `grantAccess`, first in the list).
- Production review rows use `Tr isRowSelected` for the highlight (visual only; env label carries the meaning).
