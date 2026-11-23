---
id: T-0198
title: Label chips link to Search (one shared path helper)
status: done
owner: frontend-engineer
checkpoint: 4b
depends_on: [T-0197]
paths: [web/src/features/resources/search/searchPath.ts, web/src/features/resources/search/searchPath.test.ts, web/src/features/resources/registry/columns.tsx, web/src/features/resources/details/MetadataSection.tsx]
review_rounds: 2
---

## Goal
SRCH-4 (and the T-0136 nit): every label chip on list rows and details metadata links to Search with that label and the
current kind preselected, built by one helper.

## Contract / design notes
- `search/searchPath.ts` — `searchPath(cluster, { namespace?, kinds?: K8sModel[], labels?: string[], name? }): string`
  producing `/c/<cluster>/search/(ns/<ns>|all-namespaces)?kind=<ref,…>&q=<k=v,…>` with `URLSearchParams` (OCP
  `public/components/utils/label-list.tsx` L12 builds `/search?kind=…&q=${encodeURIComponent('k=v')}`). Reuse
  `kindRef.toRef` from T-0197. T-0197's own URL writes may switch to it (optional).
- `registry/columns.tsx:ListLabels` (L139-160) and `details/MetadataSection.tsx` (L82-87) drop their inline builders and
  call `searchPath` with the row's namespace (all-namespaces when the kind is cluster-scoped). Update the
  `ListLabels` comment that says "no Search page". `podSelectorColumn` (L94) keeps linking to the Pods list
  (ADR-0023 §2) — out of scope.

## Context pack
- Touch points: `registry/columns.tsx:ListLabels` L139-160; `details/MetadataSection.tsx` L82-87; their existing tests.
- OCP reference: `/home/bad/works/openshift-console/frontend/public/components/utils/label-list.tsx` L12.

## Acceptance criteria
- [x] SRCH-4: a Deployment row's `app=web` chip links to `/c/<c>/search/ns/shop?kind=apps~v1~Deployment&q=app%3Dweb`; the details metadata chip does the same (tests).
- [x] `searchPath` unit tests: keys with `/`, `.`, values with `=`, multiple labels, cluster-scoped kind, core kind.
- [x] `ListLabels` and `MetadataSection` share `searchPath`; neither builds a label URL inline.
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-23 frontend-engineer: `searchPath(cluster, { namespace, kinds, labels, name, search })` replaces T-0197's
  positional signature (callers SearchPage/SearchRedirect updated); ListLabels (row namespace, all-namespaces when
  cluster-scoped) and MetadataSection call it. Unit tests + kinds.test.tsx href expectations updated. Gate green.
- 2026-11-23 round 1 fix: ListLabels uses the route namespace (ALL_NAMESPACES when none/cluster-scoped), `namespace`
  prop dropped; all-projects test expects `search/all-namespaces`; TSDoc note on `search` option.

## Review
- 2026-11-23 frontend-architect, round 1: CHANGES_REQUESTED
- web/src/features/resources/registry/columns.tsx:146-153 + L177 — in all-projects lists a row's label goes to `/search/ns/<row ns>`; OCP `LabelList` links to `/search?…`, which `NamespaceRedirect` (`public/components/utils/namespace-redirect.tsx`) resolves to the *active* namespace, i.e. `/search/all-namespaces` from an all-projects list (UI north star beats my contract wording "row's namespace") — use the route scope again (`useResourceRoute().namespace`, `ALL_NAMESPACES` when absent or cluster-scoped), drop the `namespace` prop, and restore the all-projects expectation in `kinds.test.tsx:201` to `/c/dev-1/search/all-namespaces?kind=core~v1~Service&q=app%3Dweb`.
- Deviations accepted: `encodeURIComponent` + literal `,` (matches AC URL, round-trips via URLSearchParams, label values can't contain `,`); options-object signature with mechanical one-line caller updates in SearchPage/SearchRedirect; MetadataSection object-namespace scope matches OCP (active ns = object's ns).
- Gate: lint/typecheck/build ok; 1068/1069 tests — only failure is an unrelated timeout in `admin/audit/AuditLogPage.test.tsx` (AUD-4, 5000 ms, load flake; not in this diff).
- Nit (optional): `searchPath` with both `search` and `kinds`/`labels` would emit duplicate params; no caller does this — a one-line TSDoc note on `search` ("not combined with the others") would suffice.
- 2026-11-23 frontend-architect, round 2: APPROVE
- Fix 1 verified: `columns.tsx` ListLabels uses `useResourceRoute().namespace`, `ALL_NAMESPACES` when absent or cluster-scoped; `namespace` prop removed.
- Fix 2 verified: `kinds.test.tsx` all-projects expectation is `/c/dev-1/search/all-namespaces?kind=core~v1~Service&q=app%3Dweb`.
- Nit addressed: `SearchPathOptions.search` TSDoc warns against combining with `kinds`/`labels`/`name`.
- Gate: lint/typecheck/build ok; 103 files / 1090 tests passed.

## Handover notes
- Encoding uses `encodeURIComponent` per value joined by a literal `,` instead of `URLSearchParams` (which would emit
  `apps%7Ev1%7EDeployment` and `%2C`); the AC's exact URL needs readable `~`. Parses identically via URLSearchParams.
- Signature changed to an options object (added `search` for the query-keeping callers); touched outside `paths`:
  `search/SearchPage.tsx`, `search/SearchRedirect.tsx` (one call each), `registry/kinds/kinds.test.tsx` (old
  `?label=` list hrefs). `useClusterNav` call unchanged.
- List label links use the route scope (all-projects list -> Search all-namespaces), per review round 1 (OCP parity).
- No visual change (hrefs only), so no ui-probe run.
