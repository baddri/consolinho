---
id: T-0218
title: Honour `matchExpressions` in workload pod selectors (Pods tab, ring, selector links)
status: todo
owner: frontend-engineer
checkpoint: CP4c
depends_on: [T-0213, T-0214, T-0217, T-0204]   # T-0204 (ux) also edits ResourceDetailsPage.tsx
paths: [web/src/features/resources/registry/types.ts, web/src/features/resources/registry/columns.tsx, web/src/features/resources/registry/kinds/, web/src/features/resources/details/ResourcePodsTab.tsx, web/src/features/resources/details/ResourceDetailsPage.tsx, web/src/features/resources/routes.tsx, web/src/features/resources/workloads/scale/WorkloadPodRing.tsx, web/src/shared/k8s/]
review_rounds: 0
---

## Goal
Owner selectors currently use `matchLabels` only (§4b.7 deferral). A workload whose selector uses `matchExpressions` therefore lists too many Pods, and its ring counts are wrong. Use the full `LabelSelector`, as OCP does with `selectorToString`.

## Scope
- In:
  - `podsSelector` returns a `LabelSelector` (`{ matchLabels?, matchExpressions? }`).
  - One shared `labelSelectorString(selector)` that emits `key in (a,b)`, `key notin (…)`, `key`, `!key` per the K8s label-selector syntax, used for `labelSelector=` query params.
  - Every consumer: Pods tab, ring, the selector link column/details.
- Out: client-side matching where the server does it. Use the server-side `labelSelector`; there is no client filter.

## Contract / design notes
- Put the type and the stringifier in `shared/k8s` (`labelSelector.ts`, unit-tested). `registry/columns.tsx:labelSelectorString` becomes a re-export or is removed in favour of it.
- An empty selector `{}` means "everything" in K8s. Keep the existing guard: no selector means no Pods tab query.

## Context pack
- Touch points:
  - `web/src/features/resources/registry/columns.tsx:labelSelectorString` (L81).
  - `web/src/features/resources/registry/types.ts` (`podsSelector` L125).
  - `grep -rln podsSelector web/src` lists 11 files: routes.tsx, ResourceDetailsPage.tsx, ResourcePodsTab.tsx, types.ts, columns.tsx and kinds/{deployments,deploymentconfigs,jobs,daemonsets,replicationcontrollers,replicasets,statefulsets}.tsx.
  - `web/src/features/resources/workloads/scale/WorkloadPodRing.tsx`.
- OCP reference: `/home/bad/works/openshift-console/frontend/public/module/k8s/selector.js` (`selectorToString`, `fromRequirements`).

## Acceptance criteria
- [ ] A Deployment fixture with `matchExpressions` (In + Exists) sends the correct `labelSelector` on its Pods tab and ring query (MSW assertion). The stringifier is unit-tested for all four operators plus mixed `matchLabels`.
- [ ] matchLabels-only workloads produce the identical query string as before (existing tests stay green).
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
