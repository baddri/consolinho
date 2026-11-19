---
id: T-0034
title: Register / edit cluster form (/admin/clusters/new, /admin/clusters/:name/edit)
status: done
owner: frontend-engineer
checkpoint: 1
depends_on: [T-0028, T-0025, T-0024]
paths: [web/src/features/admin/clusters/form/, web/src/features/admin/clusters/ClusterFormPage.tsx, web/src/features/admin/clusters/api.ts, web/src/app/router.test.tsx]
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
`Concurrency.Conflict`). Validation rules: contract §8.2 (copy messages). Successful edit also invalidates
`accessibleClustersQueryKey` (`@/features/cluster-context`): display name and environment are shown (and ordered)
in the switcher (T-0029 review).
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
- [x] CLU-1: valid create sends the exact request body (nulls for empty optionals) with CSRF header and lands on the
      Credentials tab URL; invalid name/apiUrl/webConsoleUrl show inline client errors; server 400 keys
      (`apiUrl`, `caBundle`) shown on the right fields; 409 NameTaken on `name`.
- [x] CLU-2: invalid CA bundle server error shown on `caBundle`; empty CA bundle sent as `null`.
- [x] CLU-3: Skip TLS shows the warning; both set → error; production + skip → confirmation required, cancel sends
      nothing.
- [x] CLU-4: edit hides `name`/`isEnabled`, sends `version`; ADM-4 conflict keeps typed values, "Reload latest
      values" resets them.
- [x] Loading/404/error states for edit mode. ADM-2 disabled Save for `ines`.
- [x] TSDoc. Build, lint, tests green.

## Work log
- 2026-11-20 frontend-engineer: implemented form (`clusters/form/`: schema, sections, `CaBundleField`, `useSaveCluster`),
  `ClusterFormPage` (register/edit, loading/404/error), `useRegisterCluster`/`useUpdateCluster` in `clusters/api.ts`
  (orchestrator: same style as T-0033, reuses its invalidation helpers). 11 tests; router rows updated. check-fe green.

## Review
- 2026-11-20 frontend-architect, round 1: **APPROVE**. Gate: lint/typecheck/build ok; only failure is T-0041 WIP
  `audit/AuditLogPage.test.tsx` (timeout); `vitest run clusters + router.test.tsx` 52/52 green.
  Zod rules match contract §8.2 (name DNS label, displayName ≤100 blank→null, environment required w/o preselect,
  apiUrl host+port only ≤2048, webConsoleUrl, description ≤1000, caBundle trim/blank→null, skip+CA on
  `skipTlsVerify`); server 400/409 mapping, version/409/reload flow, ADM-2, loading/404/error, invalidation all OK.
  Judged engineer notes: mutations in `clusters/api.ts` — accepted (reuses T-0033 invalidation; update `paths`);
  prod+skip confirm on every save of an insecure prod cluster — accepted (task says submitted value; safer).
  Optional nits / follow-ups:
  - `form/CaBundleField.tsx:155` — deep import of `@/shared/forms/fieldA11y` — follow-up task: shared
    `FileUploadField` adapter in `shared/forms` (T-0036 token upload reuses it).
  - `form/CaBundleField.tsx:182` — CA textarea lacks `aria-describedby` (helper/error not linked; `aria-invalid`
    is set) — fix in that follow-up via `hideDefaultPreview` + own `TextArea` child with `aria-describedby`.
  - `form/CaBundleField.tsx:199` — `onReadFailed` gives no feedback — show an error on the field in the follow-up.
  - `form/clusterForm.schema.ts:82` — no client 256 KiB cap on `caBundle` (server rejects) — optional `.max`.
  - `form/ClusterForm.test.tsx:283` — after reload, assert a second Save sends the refreshed `version` — optional.

## Handover notes
- Mutations live in `clusters/api.ts` (not `form/api.ts` as `paths` said) per orchestrator, to reuse
  `invalidateAfterSuccess/Error` (admin prefix + `accessibleClustersQueryKey`).
- `CaBundleField` deep-imports `fieldA11y`/`FieldHelperText`/`useWrapperFocusRef` from `@/shared/forms/fieldA11y`
  (not in the barrel). Follow-up candidate: a shared `FileUploadField` adapter (T-0036 token upload could reuse it).
- PF `FileUpload` doesn't forward `aria-describedby` to its textarea, so the CA bundle's helper/error text is visible
  but not programmatically linked (`aria-invalid` is set); worth fixing in the shared adapter follow-up.
- Production + Skip TLS confirmation fires whenever the *submitted* values are production + skip (also on edits of an
  already-insecure prod cluster). Client mutual-exclusion rule runs even when other fields are invalid (zod `when`).
- Edit form seeds `defaultValues` once; background refetches (e.g. after the 409 invalidation) never overwrite input.
