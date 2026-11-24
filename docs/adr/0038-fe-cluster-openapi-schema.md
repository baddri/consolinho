# 0038 — Frontend: cluster OpenAPI v3 schema (YAML validation, schema sidebar, field help)
**Status:** Accepted (2026-11-24, CP4c design) · extends ADR-0022 (k8s data layer), ADR-0024 (bundled Monaco) ·
spec `docs/specs/CP4-workloads.md` §4c.1–4c.2 (OAPI, HELP)

## Context
CP4c adds three consumers of the active cluster's API schema: Monaco YAML validation/completion/hover and OCP's
"View sidebar" schema browser in the YAML editor (OAPI-3, parity waiver W1), and the dashed-underline field-help popovers
on details terms (HELP-1, waiver W3). OCP loads the whole `/openapi/v2` swagger once into a module global and hands all
definitions to `monaco-yaml` (`console-shared/.../yaml-editor-utils.ts:getConsoleYamlSchemas`, `public/module/k8s/swagger.ts`).
We manage ~40 clusters with different versions and CRDs, so a schema must never leak across clusters, must not be
fetched in full when one kind is needed, and must degrade silently when an SA may not read `/openapi` (OAPI-2). The proxy
already forwards `/openapi/...` (non-resource GET, `ProxyPath` allow-list). The CSP is `script-src 'self'`,
`worker-src 'self'` (SECURITY.md).

## Decision
1. **OpenAPI v3, lazily per group-version.** `shared/k8s/openapi.ts` reads the index `GET <proxy>/openapi/v3`
   (`paths: { 'api/v1' | 'apis/<group>/<version>': { serverRelativeURL } }`), then only the document of the model's
   group-version via its `serverRelativeURL` (it carries `?hash=`, so the content is immutable). Both through
   `k8sGetPath` (one URL builder, `ApiError` on failure). No v2 fallback: every supported cluster (OCP 4.12+, K8s 1.27+)
   serves v3.
2. **Cache = TanStack Query, keyed per cluster** (FRONTEND.md "Data fetching rules"):
   `['k8s', cluster, 'openapi']` (index) and `['k8s', cluster, 'openapi', gvPath]` (one parsed document:
   `{ components: { schemas: Record<string, JSONSchema> } }`). `staleTime: Infinity`; `gcTime` Infinity for the small
   index, 30 min for documents (the core document is several MB; 40 clusters × all groups must not pile up). The cluster
   in the key is the only isolation needed; `clearSessionCache` drops it at logout. Derived data (kind → schema name,
   per-kind JSON Schema, path lookups) is memoised per document object (`WeakMap`), never stored in the cache.
3. **Kind lookup** by `x-kubernetes-group-version-kind` ({group, version, kind} of the `K8sModel`), not by guessing the
   definition name — CRDs and OpenShift kinds work the same way.
4. **Degrade silently (OAPI-2).** Any error (403, 404, network, malformed) → the hooks return no schema; `retry: false`
   for 403/404; one `console.debug` per cluster per session (module `Set`); no `ErrorState`, no toast. Consumers treat
   "no schema" exactly like "still loading": the editor works without validation, terms render plain, the sidebar toggle
   is hidden (OCP hides it when `definitionFor` has no properties).
5. **Parsing stays on the main thread** (native `Response.json()`); there is no worker of our own. OAPI-4 is met by
   budget, not by a worker: a Vitest test parses a ≥ 2 MB synthetic core/v1-sized document, finds a kind and resolves a
   nested path in < 100 ms. Validation itself runs off the main thread in `monaco-yaml`'s worker.
6. **Monaco YAML = `monaco-yaml`** (OCP's library, MIT, peer `monaco-editor >= 0.36`), bundled like Monaco
   (ADR-0024): `monacoSetup.ts` imports `monaco-yaml/yaml.worker.js?worker`, `MonacoEnvironment.getWorker(_, label)`
   returns it for `label === 'yaml'`, and calls `configureMonacoYaml(monaco, { isKubernetes: true, validate: true,
   hover: true, completion: true, enableSchemaRequest: false, schemas: [] })` **once** per page (module singleton;
   `format: { enable: false }`; keep the basic YAML contribution import — `monaco-yaml` has no tokenizer, OCP also
   loads both; amended in T-0211 review). The editor component calls
   `monacoYaml.update({ schemas: [{ uri: 'fleetconsole://schema/<cluster>/<gvk>', fileMatch: ['*'], schema }] })` when its
   schema prop changes and clears it on unmount — only one YAML editor is mounted at a time. `enableSchemaRequest: false`
   means the worker never fetches anything (CSP `connect-src`, no token leaks). The chunk rule `vendor-monaco` in
   `vite.config.ts` also captures `monaco-yaml`.
7. **Per-kind JSON Schema** handed to the worker: `{ allOf: [{ $ref: '#/components/schemas/<root>' }], components: { schemas } }`
   (amended by T-0239: the language server applies draft-07 rules and drops a root `$ref`'s siblings, `components` included)
   where `schemas` is the transitive `$ref` closure of the root only (Deployment ≈ 150 schemas instead of the whole
   document) — keeps the structured clone to the worker small. OpenAPI v3 schemas are used as JSON Schema unchanged
   (`allOf`/`$ref` wrappers, `x-kubernetes-*` extensions are ignored by the language server).
8. **One path resolver** `resolveSchemaPath(doc, rootName, path)` (follows `$ref`, single-element `allOf`, array
   `items`, `additionalProperties`) returns `{ name, type, description, required, properties }`; the sidebar
   (breadcrumb navigation) and field help both use it. Field help reaches `shared/ui`'s `DetailsItem` through a small
   context (`FieldHelpContext`: `kind` + `describe(path)`) provided by the details tab, so `shared/ui` stays free of k8s
   knowledge and call sites only add OCP's `path` prop.

## Consequences
- + Schemas never cross clusters; only the needed group-version loads; RO SAs without `/openapi` see no error.
- + `monaco-yaml` brings OCP-identical validation/hover/completion; the YAML worker is lazy (YAML routes only).
- − `monaco-yaml` (+ prettier inside its worker) grows the lazy `vendor-monaco` chunk; the main chunk is unchanged.
- − The first YAML open per group-version and cluster waits for one extra GET (several MB for core/v1); the editor is
  usable meanwhile.
- Revisit if a supported cluster lacks `/openapi/v3` (would need a v2 fallback) or if the parse budget test fails on CI.
