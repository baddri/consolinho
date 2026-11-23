---
id: T-0174
title: k8s data layer — JSON Patch, subresources, subresource access checks; mock PATCH/scale; CP4a dependencies
status: todo
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
- [ ] `k8sPatch` sends one PATCH with the JSON Patch content type and the CSRF header; subresource paths encode name/subresource (unit tests).
- [ ] SSAR carries `subresource`; distinct cache keys per subresource (test).
- [ ] Mock: PATCH labels updates the object and the live list/details without reload; `PATCH …/scale` changes replicas; RO grant → 403 `Proxy.ReadOnlyGrant` before the store (ACT-4/5 in mock).
- [ ] Dependencies pinned exactly; `npm run build` chunks unchanged (unused deps not imported yet).
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
