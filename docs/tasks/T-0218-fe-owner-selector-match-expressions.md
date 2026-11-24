---
id: T-0218
title: Honour `matchExpressions` in workload pod selectors (Pods tab, ring, selector links)
status: done
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
- [x] A Deployment fixture with `matchExpressions` (In + Exists) sends the correct `labelSelector` on its Pods tab and ring query (MSW assertion). The stringifier is unit-tested for all four operators plus mixed `matchLabels`.
- [x] matchLabels-only workloads produce the identical query string as before (existing tests stay green).
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-24 frontend-engineer: in_progress → in_review. `shared/k8s/labelSelector.ts` (`labelSelectorString(LabelSelector)`, OCP `selectorToString`, matchLabels keep object order) + unit tests; `podsSelector`/`summary.podSelector`/`PodSelectorLink`/`PodRing`/`fixedSelector` take `LabelSelector`. MSW tests on a `matchExpressions` Deployment (Pods tab, ring, selector link). Full check-fe green.
- Process slip: a broad `prettier --write src/features/resources` reformatted ~60 files; pure-format ones restored from HEAD, but lane B's uncommitted deployments/form WIP was reformatted in place (formatting only).
- 2026-11-24 frontend-engineer: fix round 1. `DataViewLabelFilter.terms()` splits like OCP `selector.ts:split` (`/,(?![^(]*\))/`), so a set term stays one chip; out-of-path edits: shared/ui/data-view/DataViewLabelFilter.tsx and a test in list/ResourceListPage.test.tsx. `{ matchLabels }` helper skipped: the inline wrap reads clearer than a helper. Prettier ran only on the edited test file. Full check-fe green.

## Review
- 2026-11-24 frontend-architect, round 1: **CHANGES_REQUESTED**. check-fe green (1216 tests). The stringifier matches OCP `selector.ts`/`selector-requirement.ts`, including `{}` → `''` = everything, the same as K8s. The DC/RC/Service/node `{ matchLabels }` wrapping is correct. Query keys are built from the string, so they stay stable even though the wrapped objects are new on each render. matchLabels-only strings are unchanged.
  - `web/src/shared/ui/data-view/DataViewLabelFilter.tsx:25` — `terms()` splits on every comma. A `PodSelectorLink` to `/pods?label=app=picky,env in (prod,stage),canary` therefore shows the chips `env in (prod` and `stage)`, and removing one sends an invalid selector (API 400). This task makes that path reachable. Fix: split as OCP `selector.ts:34` does, `value.split(/,(?![^(]*\))/)`. Add a DataViewLabelFilter test with an `in (a,b)` term (one chip; removing another chip keeps it intact). This is an off-`paths` edit; log it in the Handover notes.
  - Nit (optional): `{ matchLabels: x.spec?.selector }` is repeated 7× in the DC/RC/Service kinds. A small `matchLabelsSelector(map)` helper in `shared/k8s/labelSelector.ts` would name the intent.

## Handover notes
- Stringifier + `LabelSelector` type live in `shared/k8s/labelSelector.ts`; `registry/columns.tsx` re-exports `labelSelectorString`.
- Plain-map kinds (DC, RC, Service, node selector) wrap as `{ matchLabels }`; `WorkloadPodRing.selector` stays a plain map (DC) and wraps internally.
- Off-`paths` consumer edits were required by the type change: components/PodRing.tsx, details/MetadataSection.tsx, list/ResourceDataView.tsx, workloads/daemonsets/daemonSetDetails.tsx, workloads/replicasets/DeploymentReplicaSetsTab.tsx (now full selector, as OCP), workloads/deploymentconfigs/DeploymentConfigRCsTab.tsx.
- Display keeps OCP's `replace(/,/g, ', ')`, so `env in (prod, stage)`, as OCP `Selector`.
- No UI probe: no layout change, only selector text/queries.

- 2026-11-24 orchestrator (round 2): verified the one finding — `terms()` splits on `/,(?![^(]*\))/` like OCP; ResourceListPage + shared/k8s tests 103/103 green. APPROVE.
