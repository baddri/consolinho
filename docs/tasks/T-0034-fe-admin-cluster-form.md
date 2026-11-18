---
id: T-0034
title: Register / edit cluster form (/admin/clusters/new, /admin/clusters/:name/edit)
status: todo
owner: frontend-engineer
checkpoint: 1
depends_on: [T-0028, T-0025, T-0024]
paths: [web/src/features/admin/clusters/form/, web/src/features/admin/clusters/ClusterFormPage.tsx]
review_rounds: 0
---

## Goal
A full-page form to register and maintain clusters with inline validation and safety prompts for insecure TLS on
production (CLU-1..4, ADM-4). Backend counterpart: T-0017; MSW until then. **Parallel group F5** — disjoint from T-0033:
everything lives in `clusters/form/` (schema, sections, `useRegisterCluster`/`useUpdateCluster` in
`clusters/form/api.ts`); `ClusterFormPage.tsx` (placeholder from T-0028) only composes it.

## Scope
- In: `ClusterFormPage` (mode from route), zod schema, register/update mutations, Skip TLS confirmation.
- Out: credentials (T-0036), enable/disable (T-0033).

## Contract / design notes
Endpoints: `POST /api/admin/clusters` (`RegisterClusterRequest` → 201 `ClusterDetail`; 409 `Clusters.NameTaken`),
`GET/PUT /api/admin/clusters/{name}` (`UpdateClusterRequest` incl. `version` → 200 `ClusterDetail`; 409
`Concurrency.Conflict`). Validation rules: contract §8.2 (copy messages).
- Layout (spec §5): `PageSection` title "Register cluster" / "Edit `<name>`"; `Form` with `FormSection`s:
  - Identity: `name` (create only; read-only text on edit; helper "Lowercase letters, digits and '-' (max 40). Used in
    URLs; cannot be changed later."), `displayName` (≤ 100, placeholder = name), `environment` radio
    (production/staging/development with `EnvironmentLabel`), `description` (≤ 1000).
  - Connection: `apiUrl` (`https://` URL, host + optional port, no path/query/fragment/user info),
    `caBundle` — PF `FileUpload type="text"` (browse or paste; `allowEditingUploadedText`), helper "Leave empty to use
    the system trust store.", `skipTlsVerify` `Switch`; when on: warning `Alert` "TLS verification is disabled —
    FleetConsole cannot detect a man-in-the-middle. Prefer a CA bundle." Client rule: caBundle non-empty and skip on
    → error on `skipTlsVerify` "Skip TLS verification and a CA bundle are mutually exclusive." (CLU-3).
  - Links: `webConsoleUrl` (optional `https://`).
  - Status (create only): `isEnabled` switch (default on).
- Edit mode: loads `ClusterDetail`, keeps `version` in form state; info helper "Changing the API URL, CA bundle or
  Skip TLS marks existing connection test results as stale." (CLU-4). Conflict → `ConflictAlert` (reload resets to
  server values).
- Saving with `skipTlsVerify` on a **production** cluster (new value) opens a `ConfirmModal variant="danger"`:
  "Save `prod-eu-1` (production) without TLS verification?" before the request (CLU-3, UI-only rule).
- Server errors via `applyServerErrors` with `codeToField: { 'Clusters.NameTaken': 'name' }`.
- Success: create → toast "Cluster prod-eu-1 registered" + navigate `/admin/clusters/<name>/credentials` (spec §5:
  land on Credentials tab with an "Add a credential" prompt — the prompt itself is T-0036's empty state); edit →
  toast + navigate to detail. Cancel → back to list/detail.
- Read-only admins: form renders, Save aria-disabled with reason.

## Acceptance criteria
- [ ] CLU-1: valid create sends the exact request body (nulls for empty optionals) with CSRF header and lands on the
      Credentials tab URL; invalid name/apiUrl/webConsoleUrl show inline client errors; server 400 keys
      (`apiUrl`, `caBundle`) shown on the right fields; 409 NameTaken on `name`.
- [ ] CLU-2: invalid CA bundle server error shown on `caBundle`; empty CA bundle sent as `null`.
- [ ] CLU-3: Skip TLS shows the warning; both set → error; production + skip → confirmation required, cancel sends
      nothing.
- [ ] CLU-4: edit hides `name`/`isEnabled`, sends `version`; ADM-4 conflict keeps typed values, "Reload latest
      values" resets them.
- [ ] Loading/404/error states for edit mode. ADM-2 disabled Save for `ines`.
- [ ] TSDoc. Build, lint, tests green.

## Work log

## Review

## Handover notes
