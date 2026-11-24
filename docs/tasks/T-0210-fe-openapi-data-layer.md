---
id: T-0210
title: Cluster OpenAPI v3 data layer (lazy per group-version, per-cluster cache, silent degrade)
status: done
owner: frontend-engineer
checkpoint: CP4c
depends_on: []
paths: [web/src/shared/k8s/openapi.ts, web/src/shared/k8s/openapi.test.ts, web/src/shared/k8s/queryKeys.ts, web/src/shared/k8s/index.ts, web/src/mocks/k8s/openapi.ts, web/src/mocks/k8s/fixtures/openapi/, web/src/mocks/k8s/apiServer.ts]
review_rounds: 1
---

## Goal
Give the SPA the active cluster's OpenAPI v3 schema so that the YAML editor (T-0211/T-0212) and field help (T-0213) can use it. Load it lazily per group-version, cache it per cluster, and degrade silently (OAPI-1, OAPI-2, OAPI-4).

## Scope
- In: the index and per-group-version document queries, kind lookup, the per-kind JSON Schema (`$ref` closure) and the path resolver; MSW handlers and fixtures; a parse-budget test.
- Out: any UI. No v2 fallback (ADR-0038 §1).

## Contract / design notes
ADR-0038 is the contract. Put everything in `web/src/shared/k8s/openapi.ts` and export it from `shared/k8s/index.ts`:
- `k8sQueryKeys.openapiIndex(cluster)` = `['k8s', cluster, 'openapi']` and `k8sQueryKeys.openapiDocument(cluster, gvPath)` = `['k8s', cluster, 'openapi', gvPath]`.
- `gvPath(model: K8sModel): string`: `'api/v1'` for the core group, otherwise `'apis/<group>/<version>'`.
- `useOpenApiSchema(cluster: string, model: K8sModel): OpenApiSchema | undefined`.
  - Fetches the index (`staleTime`/`gcTime` Infinity), then the document at `paths[gvPath].serverRelativeURL` (`staleTime` Infinity, `gcTime` 30 min).
  - Uses `retry: false` for ApiError 403/404.
  - Returns `undefined` while loading **and** on any error.
  - Logs one `console.debug` per cluster per session (module `Set`).
- `interface OpenApiSchema { doc: OpenApiDocument; rootName: string; jsonSchema: JSONSchema }`.
  - `rootName` comes from `x-kubernetes-group-version-kind`.
  - `jsonSchema` = `{ $ref: '#/components/schemas/<root>', components: { schemas: closure } }`.
  - Memoise it in a `WeakMap<OpenApiDocument, Map<kindKey, …>>`.
- `resolveSchemaPath(doc, rootName, path: readonly string[]): SchemaField | undefined`.
  - `SchemaField = { name, type, description?, required: readonly string[], properties?: Record<string, SchemaRef> }`.
  - Follows `$ref`, a single-element `allOf`, array `items` (path segment `'items'` not needed: an array field's children are its items' properties) and `additionalProperties`.
  - Type text follows OCP `explore-type-sidebar.tsx` (`array`, `[]Container`, `map[string]string`, `object`, `string`).
- Mocks:
  - `mocks/k8s/apiServer.ts` serves `GET /openapi/v3` (index) and `GET /openapi/v3/<gvPath>?hash=…` from trimmed fixtures (`api/v1`: Pod, Container, ConfigMap, Secret, ObjectMeta; `apis/apps/v1`: Deployment, DeploymentSpec, DeploymentStrategy, PodTemplateSpec ref).
  - Real upstream descriptions, trimmed. One mock cluster answers 403 (reuse the existing RO/forbidden cluster switch in `apiServer.ts`).

## Context pack
- Docs: ADR-0038 (whole, short); `FRONTEND.md` § "Data fetching rules" (OpenAPI bullet).
- Exemplars: `web/src/shared/k8s/discovery.ts:useK8sDiscovery` (per-cluster query + `k8sGetPath`, the shape to copy); `web/src/shared/k8s/queryKeys.ts:k8sQueryKeys` L22-45.
- Touch points: `web/src/shared/k8s/client.ts:k8sGetPath` (L63); `web/src/mocks/k8s/apiServer.ts:apiServer` (~L433-450 `/version`, `/api`, `/apis` branches, add `/openapi/v3` next to them); `web/src/mocks/k8s/handlers.ts` already lets `/openapi` through.
- OCP reference: `/home/bad/works/openshift-console/frontend/public/module/k8s/swagger.ts` (`definitionFor`, `getSwaggerPath`, type text); `public/components/sidebars/explore-type-sidebar.tsx` (how types are named). OCP uses v2 and one global; we use v3 per cluster (ADR-0038).

## Acceptance criteria
- [x] OAPI-1: the hook fetches the index plus only the model's group-version document. Query keys carry the cluster, and a test shows that switching cluster refetches and never returns the other cluster's schema.
- [x] OAPI-2: on 403 and 404 the hook returns `undefined`, makes no retry, logs one `console.debug` per cluster (tested), and raises no error UI.
- [x] OAPI-4: a Vitest test builds a ≥ 2 MB synthetic core/v1-like document, then `JSON.parse` + kind lookup + `resolveSchemaPath(['spec','containers','resources','limits'])` completes in < 100 ms.
- [x] Unit tests for `resolveSchemaPath` cover: `$ref`, `allOf`, array items, map `additionalProperties`, the required list, an unknown path returning `undefined`, and the per-kind `$ref` closure (it contains no unrelated schemas).
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-24 frontend-engineer: started; `shared/k8s/openapi.ts` + MSW `/openapi/v3` fixtures.

- 2026-11-24 frontend-engineer: done. `openapi.ts` (hook, kind lookup, closure, resolver), query keys, exports; MSW
  `/openapi/v3` + `fixtures/openapi/{core,apps}.ts`; 10 tests incl. 2 MB parse budget. Full gate green. No UI, so no
  style probe. Nothing added to `shared/ui/index.ts`.

## Review
- 2026-11-24 frontend-architect, round 1: **APPROVE**. Matches ADR-0038 §1–5, 7, 8. Keys, staleTime/gcTime, retry for 403/404, one debug per cluster, WeakMap memo, GVK lookup and closure are all tested. `SchemaRef` `{type, description?, enum?, drillable}` + parent `required` fits T-0212 (list, "View details", required label) and T-0213 (description only). Gate: typecheck/test/build ok. The first run's lint error went away on re-lint (another lane's file, not T-0210).
  - nit (optional): `openapi.ts` `useOpenApiSchema` — `serverRelativeURL` comes from the cluster. Add a guard (`url.startsWith('/openapi/v3/')`, no `..`) so a hostile index can't point the GET at other same-origin paths. GET only and the body is never shown, so this is low impact.

## Handover notes
- API (`@/shared/k8s`): `useOpenApiSchema(cluster, model)`, `openApiSchemaFor(doc, model)` (memoised, non-hook),
  `resolveSchemaPath(doc, rootName, path)`, `gvPath`, types `OpenApiSchema`, `OpenApiDocument`, `OpenApiIndex`,
  `JSONSchema` (own interface, not `@types/json-schema`), `SchemaField`, `SchemaRef`, `GroupVersionKind`.
- `SchemaRef` = child summary `{ type, description?, enum?, drillable }`: enough for the T-0212 sidebar list (OCP
  "View details" when `drillable`, "Allowed values" from `enum`). Child description = property's own, else target's.
- Type text: primitives/`format` of referenced primitives (`date-time`, `int-or-string`), `object`, `[]Container`,
  `[]string`, `map[string]string`. Root (empty path) has name = kind short name, type `object`.
- Failure reasons also include "gv not in index" and "kind not in document"; all → `undefined` + one debug per cluster.
- Mock: `view`-profile credentials get 403 on `/openapi/*` (alice@prod-eu-1, carol@dev-2), so OAPI-2 shows in the
  mock UI; only `api/v1` and `apis/apps/v1` are in the index (other kinds silently get no schema).

- 2026-11-24 orchestrator: applied review nit — `serverRelativeURL` must start with `/openapi/v3/` and contain no `..`.
