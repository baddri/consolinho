---
id: T-0174
title: k8s data layer — JSON Patch, subresources, subresource access checks; mock PATCH/scale; CP4a dependencies
status: done
owner: frontend-engineer
checkpoint: 4a
depends_on: []
paths: [web/package.json, web/package-lock.json, web/src/shared/k8s/client.ts, web/src/shared/k8s/client.test.ts, web/src/shared/k8s/url.ts, web/src/shared/k8s/queryKeys.ts, web/src/shared/k8s/access.ts, web/src/shared/k8s/index.ts, web/src/features/resources/actions/useResourceAccess.ts, web/src/mocks/k8s/apiServer.ts, web/src/mocks/k8s/subresources.ts, web/src/mocks/k8s/rbac.ts, web/src/mocks/k8s/store.ts]
review_rounds: 0
---

## Goal
Foundation for every CP4a write (ADR-0037 §4, §8): `k8sPatch`, subresource URLs (`scale`, `log`, `exec`), access
checks on subresources (`patch deployments/scale`, `create pods/exec`), and a mock API server that applies JSON Patch
and serves `scale`. Also installs all CP4a dependencies once so parallel tasks never race on `package.json`.

## Scope
- In: client/url/access/queryKeys changes + tests; `useResourceAccess` widened; mock PATCH + `scale` + subresource
  RBAC; deps (exact pins): `@patternfly/react-log-viewer` (PF 6 line matching react-core 6.7), `@xterm/xterm`,
  `@xterm/addon-fit`, `use-debounce`; dev `fast-json-patch`.
- Out: `log` and `exec` mock handlers (T-0178, T-0180 add entries to `subresources.ts` / ws handler), any UI.

## Contract / design notes
- `ResourceApiPathOptions.subresource?: string` → `…/<plural>/<name>/<subresource>` (requires `name`).
- `k8sPatch<T>(cluster, model, target: { namespace?; name; subresource? }, patch: JsonPatchOp[]): Promise<T>`;
  `JsonPatchOp = { op: 'add' | 'replace' | 'remove' | 'test'; path: string; value?: unknown }`; header
  `Content-Type: application/json-patch+json` (extend `K8sRequestInit` with `contentType?`). Throws `ApiError` only.
- `AccessReview.subresource?: string` → SSAR `resourceAttributes.subresource`; included in `k8sQueryKeys.access`.
- `ResourceAccessReview.verb: AccessVerb` (was `'update' | 'delete'`), `subresource?`; `rbacDeniedReason` names
  `plural/subresource` ("cannot patch deployments/scale in shop").
- Mock: `parseTarget` returns `subresource`; `apiServer` dispatches it via `subresources.ts`
  (`Record<string, SubresourceHandler>`; `scale` GET/PATCH maps `spec.replicas` ⇄ `autoscaling/v1 Scale`); PATCH on
  objects applies `fast-json-patch` `applyPatch` (400 `BadRequest` on an invalid op, 422 `Invalid` on a type error),
  bumps `resourceVersion`, emits a watch MODIFIED. RBAC by credential profile: view profiles deny `patch` and all
  subresource writes; `pods/log` follows `get pods`.

## Context pack
- Docs: `FRONTEND.md` § Data fetching rules; ADR-0022 §1, §9; ADR-0037 §4, §8.
- Exemplars: `shared/k8s/client.ts:k8sUpdate` (L134-141) and `k8sFetch` (L36-58); `shared/k8s/url.ts:resourceApiPath` (L28-40);
  `shared/k8s/access.ts:reviewAccess` (L11-25); mock `apiServer.ts:verbOf` (L111-127), `parseTarget` (L378-390), the PUT branch near L482.
- Touch points: `useResourceAccess.ts:ResourceAccessReview` (L20-28), `rbacDeniedReason` (L14-17); callers of `useResourceAccess` (grep).

## Acceptance criteria
- [x] `k8sPatch` sends one PATCH with the JSON Patch content type and the CSRF header; subresource paths encode name/subresource (unit tests).
- [x] SSAR carries `subresource`; distinct cache keys per subresource (test).
- [x] Mock: PATCH labels updates the object and the live list/details without reload; `PATCH …/scale` changes replicas; RO grant → 403 `Proxy.ReadOnlyGrant` before the store (ACT-4/5 in mock).
- [x] Dependencies pinned exactly; `npm run build` chunks unchanged (unused deps not imported yet).
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-23 frontend-engineer: `k8sPatch` + `JsonPatchOp`/`PatchTarget`, `subresource` in url/SSAR/access key,
  `useResourceAccess` widened (`AccessVerb`, `subresource`, "deployments/scale" reason). Mock: object PATCH via
  fast-json-patch, `subresources.ts` (`scale`), subresource RBAC. Deps pinned. Tests in `client.test.ts`; check-fe green.

## Review
- 2026-11-23 frontend-architect, round 1: **APPROVE** (check-fe green: 899 tests, build ok; no new deps imported in `src` outside mocks).
- Judged OK: PUT label/annotation string check in `apiServer.ts:validationErrors`. PATCH shares it and needs it for the 422 AC, and real apiservers reject these values too. Small and in task paths.
- Judged OK: mock tests in `shared/k8s/client.test.ts`. They are client↔mock integration tests, and the design left the mock test file out of `paths`, so that gap is mine.
- Pins verified: all exact and all current `latest` (log-viewer 6.5.0 peers react-core ^6 and dedupes with 6.7.0; xterm 6.0.0 + addon-fit 0.11.0 is the matching pair; use-debounce 10.1.1). `fast-json-patch` as devDependency is correct because mocks never reach dist (`vite.config.ts:132`).
- Seams: `log` (T-0178) fits. GET+name gives `get pods/log`, `query` is passed through, and `serve` may return a streamed `Response`.
- Nit (optional): `mocks/k8s/subresources.ts:8` + Handover note say T-0180 adds `exec` to `SUBRESOURCES`. Exec is a `ws.link` handler (T-0180 L39) and never reaches `apiServer` (POST+name → `verbOf` undefined → 405). Reword so the WS handler checks `isAllowed(profile, 'create', rbacResource('pods','exec'))` itself, and never register exec as a GET entry, which would let `view` exec.
- Nit (optional): `apiServer.ts:33` doc line exceeds 120 cols after the edit; rewrap.
- Follow-up (optional): move mock-behaviour cases (400/422 mapping, scale validation) to the mock test file in a later mock-touching task.
- Orchestrator: applied the exec-seam nit (comment + Handover note); `apiServer.ts:33` width nit left.

## Handover notes
- Deps (exact): `@patternfly/react-log-viewer` 6.5.0 (latest PF6 line; dedupes react-core 6.7.0), `@xterm/xterm` 6.0.0,
  `@xterm/addon-fit` 0.11.0, `use-debounce` 10.1.1; dev `fast-json-patch` 3.1.2. None imported in `src` → dist unchanged.
- `resourceApiPath` throws on `subresource` without `name` (programming error, not ApiError).
- Mock `subresources.ts`: add a `SubresourceHandler` (`appliesTo(model)`, `serve(req)`) to `SUBRESOURCES` for `log`
  (T-0178). Unknown subresource or kind without it → 404; RBAC runs first on `plural/sub`. Exec (T-0180) is a `ws.link`
  handler that checks `create pods/exec` itself; never register it as a GET entry (that would let `view` exec).
- Mock PATCH: requires `application/json-patch+json` (else 415); malformed op 400, unresolvable path / failed `test` /
  post-patch type error (labels/annotations non-string, name/kind change) 422; patched `resourceVersion` ≠ stored → 409.
- `scale` GET/PATCH for apps deployments/replicasets/statefulsets; replicas must be a non-negative integer (422).
- Shared `validationErrors` now also rejects non-string label/annotation values on PUT (was unchecked).
- `store.ts`/mock `k8s.test.ts` untouched: `upsertObject` already bumps RV + emits MODIFIED; mock tests live in
  `shared/k8s/client.test.ts` (task paths).
