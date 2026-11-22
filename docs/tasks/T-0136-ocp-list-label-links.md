---
id: T-0136
title: List Labels cells as links, like OCP's LabelList
status: done
owner: frontend-engineer
checkpoint: 3.6
depends_on: [T-0132]
paths: [web/src/features/resources/registry, web/src/shared/ui/ResourceLabels.tsx, docs/architecture/ocp-parity.md]
review_rounds: 2
---

## Goal
Parity row "List Labels cell" (gap, T-0132 visual review): in OCP, list labels are blue links
(`public/components/utils/label-list.tsx`) to Search filtered by that label; ours are plain grey labels on the
Pods/Deployments/ReplicaSets/Services lists. We have no Search page yet (CP4), so each label links to the same kind's
list in the same scope with the label filter (`?label=key=value`, ADR-0023), which shows the same result for one kind.

## Scope
- In: the shared labels column in `registry/columns.tsx` (+ `columns.module.css`): PF `Label` with OCP's colour/variant
  and `render` link, wrap/truncate behaviour from T-0132 unchanged; tests.
- Out: a Search page; details-page label lists unless they use the same component.

## Acceptance criteria
- [x] List labels look like OCP's (colour, variant) and link to the kind's list filtered by that label.
- [x] Lists still fit at 1280/1920 (T-0131/T-0132 checks).
- [x] Side-by-side with the reference at 1280, light and dark; parity row set to `match`; build, lint and tests green.

## Work log
- 2026-11-22 frontend-engineer: started; OCP `label-list.tsx` (kind-coloured `co-label` links, `LabelGroup` 20 open).
- 2026-11-22 frontend-engineer: `ListLabels` in `columns.tsx`; `labelsColumn(model)`. 1280 light/dark vs ref: same classes
  (`pf-m-<colour> pf-m-filled pf-m-clickable`), 26px/12px. Fit (dev:mock, light, seeded long labels): Pods/Deploy/RS/
  Services, project + all projects: 894/894 at 1280, 1534/1534 at 1920, stable loading→loaded→no-match. check-fe green.
- 2026-11-22 frontend-engineer (r1): `ResourceLabels` gets `isBoxed` (default true) + `isClickable={linkTo !== undefined}`;
  `ListLabels` wraps it unboxed. Details labels now `pf-m-clickable` like the ref (1280 light). Deployments 894/894 at
  1280 (project + all projects, stable). `cell()` via header index + `cell` role. `?label=` helper skipped
  (`MetadataSection.tsx` outside paths). check-fe green (813).

## Review

### Visual (ux-designer)
APPROVE (2026-11-22; 1280 light+dark vs ref `/k8s/ns/openshift-console/deployments`, `/k8s/all-namespaces/replicasets`).
- Same PF classes as OCP's `co-label` (`pf-m-filled pf-m-clickable`, 26px, 12px, text 21/31 rgb); colours = OCP `$kindsToModifier` (`public/style/_text.scss`: deployment/replicaset blue, service green).
- Clicked `app=web` on Deployments: lands on the same list with the "Label app=web" chip and "Clear filters", 1 row; all-projects RS links stay in all projects.
- Tables 894/894 at 1280 in all six captures (OCP's RS all projects overflows, 1483/894). Search-link deviation accepted until CP4; parity row correct.

### Code (frontend-architect)
CHANGES_REQUESTED (2026-11-22; check-fe green, 812 tests). Behaviour, scope-aware links and encoding are right
(`URLSearchParams` → `app%3Dweb`, same as the Pod selector links; k8s label values can't contain `=`, keys with `/` are
encoded). Pods has no Labels column, which matches OCP's default pod-list columns, so nothing to align there.
- `registry/columns.tsx:ListLabels` — copies `shared/ui/ResourceLabels.tsx:21-50` almost line for line, and the two copies
  already differ (`isClickable` only here, so details labels lack `pf-m-clickable`) — reuse it now: give `ResourceLabels`
  an unboxed variant (e.g. `isBoxed?: boolean`, default true, which applies `styles.box`) and set `isClickable={linkTo !== undefined}`
  there. `ListLabels` then just wraps `<ResourceLabels isBoxed={false} …>` in `styles.labels`. Add
  `web/src/shared/ui/ResourceLabels.tsx` to the task paths.
Nits (optional): the `?label=` path builder is duplicated in `details/MetadataSection.tsx:82-87`, so a shared helper
next to `resourcePath` would remove the copy. `kinds.test.tsx` `cell()` uses `querySelector`, which is tolerable in tests,
but `getAllByRole('gridcell')` plus the header index would be more RTL-idiomatic.
Round 2: APPROVE (2026-11-22; check-fe green, 813 tests). `ListLabels` is now a thin wrapper over `ResourceLabels isBoxed={false}`;
`isClickable` is shared (details labels gain `pf-m-clickable`, covered in `details.test.tsx`); paths widened; `cell()` is role-based.
The `?label=` helper nit is still open (follow-up).

## Handover notes
- `labelsColumn` now takes the model (colour + link target); callers: Deployments, ReplicaSets, Services.
- `ListLabels` reads the scope from `useResourceRoute`: per-project lists link to `k8s/ns/<ns>/<plural>?label=k%3Dv`,
  all projects to `k8s/all-namespaces/...`; plain labels outside a cluster route. OCP links to Search (we have none).
- `ListLabels` is a thin wrapper over shared `ResourceLabels isBoxed={false}` (r1); details labels are clickable too.
- Open nit: a shared `?label=` path helper (also built in `details/MetadataSection.tsx`).
- Tests: kinds.test.tsx label links (project, all projects, blue Deployment); selector queries scoped by cell.
