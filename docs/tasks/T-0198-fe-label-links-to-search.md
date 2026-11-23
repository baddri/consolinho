---
id: T-0198
title: Label chips link to Search (one shared path helper)
status: todo
owner: frontend-engineer
checkpoint: 4b
depends_on: [T-0197]
paths: [web/src/features/resources/search/searchPath.ts, web/src/features/resources/search/searchPath.test.ts, web/src/features/resources/registry/columns.tsx, web/src/features/resources/details/MetadataSection.tsx]
review_rounds: 0
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
- [ ] SRCH-4: a Deployment row's `app=web` chip links to `/c/<c>/search/ns/shop?kind=apps~v1~Deployment&q=app%3Dweb`; the details metadata chip does the same (tests).
- [ ] `searchPath` unit tests: keys with `/`, `.`, values with `=`, multiple labels, cluster-scoped kind, core kind.
- [ ] `ListLabels` and `MetadataSection` share `searchPath`; neither builds a label URL inline.
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
