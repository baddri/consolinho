---
id: T-0147
title: Switcher shows display name, cluster type icon and OCP/K8s tag
status: done
owner: frontend-engineer
checkpoint: 3.7
depends_on: [T-0145, T-0146]
paths: [web/src/features/cluster-context, web/e2e/switcher.e2e.ts]
review_rounds: 2
---

## Goal
SW-1..7: the switcher names clusters the way admins named them (display name first, cluster name as description /
tooltip) and shows what kind of cluster it is (type icon + `OCP`/`K8s` tag), with a one-line toggle (SW-2, decided).

## Scope
- In: `ClusterSwitcher.tsx` item, toggle, labels, accessible name, search; tests; e2e text updates.
- Out: theme (T-0149), fleet entry (done in T-0145 — keep it).

## Contract / design notes
- Labels (`ClusterLabels`, L34-47) take a `placement: 'menu' | 'toggle'`: order `ClusterTypeLabel`, `EnvironmentLabel`,
  and `Read only` **only** for `menu` (SW-4, SW-5). Pieces from `shared/ui` (T-0146).
- Menu item (`ClusterItem`): `icon={<ClusterTypeIcon distribution />}`, main text `Truncate content={displayName}` +
  labels in the existing `ClusterBadges` flex, `description={name}` only when `displayName !== name` (SW-1). Keep PF
  `MenuItem` + `description` (spec §5: no custom two-line layout). `itemId` stays `name`.
- Toggle: `icon={<ClusterTypeIcon distribution />}` replaces `ClusterIcon` (SW-3); `ToggleContent` renders
  `displayName` in the existing truncating `Title h2 md` + toggle labels. Tooltip with the cluster name when it
  differs: PF `Tooltip content={name} triggerRef={toggleRef}` (no wrapper element, the toggle keeps its ref).
- `toggleLabel(cluster)`: `Cluster <displayName> (<name if different>, <tag>, <env text>[, read only]), switch cluster`
  — e.g. "Cluster Prod EU West (prod-eu-1, OCP, prod, read only), switch cluster" (SW-4).
- `matchesSearch` adds `clusterTypeText(d).tag` and `.word` (SW-6).
- Empty-state toggle ("No clusters") keeps `ClusterIcon`. Update the component TSDoc (L120-134).

## Context pack
- Docs: `UX.md` §2 (L44-47) and §2a icons/tag/order (L82-85); spec §5 "Switcher menu", "Toggle".
- Exemplars: `web/src/features/cluster-context/ClusterSwitcher.tsx` `ClusterLabels` L34-47, `ClusterBadges` L50-59,
  `ToggleContent` L66-82, `toggleLabel` L88-92, `matchesSearch` L98-106, `ClusterItem` L109-118, toggle L271-282.
- Touch points: `shared/ui` `ClusterTypeLabel`, `ClusterTypeIcon`, `clusterTypeText` (T-0146);
  `features/cluster-context/clusterContext.test.tsx` (switcher assertions by name/label); `web/e2e/switcher.e2e.ts`.
  Fixture display names: `web/src/mocks/fixtures/clusters.ts:clusterFixtures`.
- OCP reference: `/home/bad/works/openshift-console/frontend/packages/console-app/src/components/nav/NavHeader.tsx`
  `PerspectiveDropdownItem` L23-43 (item = icon + `Title h2 md`), toggle L98-115.

## Acceptance criteria
- [x] Item: display name main text, name as description only when different (SW-1); type icon; labels type, env, Read only (SW-3, SW-5).
- [x] Toggle: one line, display name truncates without pushing tags out; type icon in `icon` slot; type + env tags, no Read only;
      tooltip = name when different; accessible name as above (SW-2..5).
- [x] Search matches `ocp`, `k8s`, `openshift`, `kubernetes` (SW-6); Recent/All, keyboard and focus unchanged (SW-7).
- [x] Icons `aria-hidden`; OpenShift and Kubernetes icons differ in shape (UX.md §2a). Build, lint and tests green (CLAUDE.md rule 4).
- [x] Probe pages (ux review): `node scripts/ui-probe.mjs /c/prod-eu-1/k8s/ns/default/pods /k8s/ns/default/pods --pair '.pf-v6-c-nav .pf-v6-c-menu-toggle=[data-test-id="perspective-switcher-toggle"]'`
      (toggle height/padding/title font must match), plus `/c/lab-1/...` for the K8s tag; long-name truncation clipped screenshot.

## Work log
- 2026-11-23 frontend-engineer: started; item/toggle/labels/search in ClusterSwitcher + switcherRows.

- 2026-11-23 frontend-engineer: done; labels/item/toggle/tooltip/search + tests, e2e regex; check-fe green (875 tests).
  Probe blocked: :5199 serves another worktree (agent-a850fcc656d8c159b), OCP :9000 down; probe AC left open.
- 2026-11-23 frontend-engineer (coordinator request, outside paths, accepted): mock `lab-1` credential `fleet-edit` +
  grants admin readWrite / alice readOnly; `clearClusterAccess()` in `mocks/db.ts` for "no credentials" tests; counts
  updated in 13 test files. check-fe green (875).
- 2026-11-23 frontend-engineer fix round 1: toggle tooltip = full display name + name on a 2nd line when different
  (ux round 1); 2 unit tests; fixture comment lines wrapped (architect nit).

## Review
- 2026-11-23 ux-designer round 1: CHANGES_REQUESTED (mock :5237 this tree, OCP ref :9000 `/k8s/ns/default/pods`; admin dev-1/lab-1, alice prod-eu-1/lab-1, 1280 light).
  - OK: toggle = OCP `perspective-switcher-toggle` (NavHeader.tsx L98-115): h 37, pad 8px 16px, gap 8px, title Red Hat Display 16px/600, icon 14px aria-hidden; item icon 14px = OCP `PerspectiveDropdownItem`.
  - OK: toggle one line, `OCP`/`K8s` + env tags, no Read only; menu: type icon (server vs cubes, distinct), display name, name as description, OCP/K8s, env, Read only; aria-label per SW-4 for all 4 cases; search ocp/k8s/openshift/kubernetes filters correctly.
  - toggle (alice prod-eu-1) — at 1280 "Production EU 1" truncates to "Producti…" and the tooltip shows only `prod-eu-1`, so the active cluster's display name is readable nowhere without opening the menu — PF guideline: truncated text gets a tooltip with the full text (`Truncate`) — tooltip content = full display name, plus the cluster name on a second line when it differs (render it whenever the toggle shows a cluster).
  - (non-blocking, follow-up) menu — the right-aligned tag group starts at a different x per row (e.g. Staging EU 1 vs Production EU 1), so `OCP`/`K8s` don't line up — no OCP counterpart — leave; reconsider only if the spec owner wants columns.
- Round 1 (frontend-architect, 2026-11-23): **APPROVE**. check-fe green (877 tests). SW-1..7 met as specified:
  `ClusterLabels placement`, item icon/description, toggle `ClusterTypeIcon` + `Tooltip triggerRef aria="none"`,
  `toggleLabel` order, `matchesSearch` tag+word; tests cover identity, tooltip and all four type searches.
- Out of paths, accepted: lab-1 credential + grants (admin RW, alice RO) are a fixture change that makes the K8s path reachable in mock
  mode and are documented in the fixture TSDoc; `clearClusterAccess` is a small, reset-safe test helper exported through
  `mocks/index.ts` (fine); count updates in 13 tests and `AppShell.test.tsx` are the required follow-on of the fixture and accessible-name changes.
- Nit (optional): prettier `printWidth` 110 (`web/.prettierrc.json`) vs the ~120 code base means reformatting the touched
  files adds churn (e.g. `switcherRows.ts` L119/L138/L155, admin tests). Follow-up task: align `printWidth` to the house
  width or format the repo in one commit. No change needed here.
- Nit (optional): `fixtures/clusters.ts` L14 and `fixtures/grants.ts` L44-46 comment lines exceed the print width; rewrap.
- Probe AC stays open for the ux-designer (environment blocked, not a code issue).
- 2026-11-23 ux-designer round 2: APPROVE. Alice on prod-eu-1 at 1280: the title truncates to "Producti…", and the tooltip shows "Production EU 1" with "prod-eu-1" on the second line. The tooltip is aria="none" (no aria-describedby); the /fleet toggle has no tooltip. No regressions.

## Handover notes
- `ClusterLabels placement` = menu|toggle; item: `ClusterTypeIcon` + display name + `description=name` when different.
- Toggle: `ClusterTypeIcon` icon (empty "No clusters" / "Select a cluster" keep `ClusterIcon`); PF `Tooltip
  triggerRef={toggleRef} aria="none"` whenever a cluster is shown: display name, then the name when it differs.
- `toggleLabel`: `Cluster <displayName> (<name if different>, <tag>, <env>[, read only]), switch cluster`.
- Search (in `switcherRows.ts` `matchesSearch`) adds `clusterTypeText` tag + word.
- Outside `paths`: `web/src/app/layout/AppShell.test.tsx` (3 toggle names + heading text) — needed for the gate.
- e2e H3 matches the toggle by regex (seeded display name unknown), asserts the type tag on the option. Not run.
- Probe AC open: rerun once :5199 serves this tree and OCP ref runs; `/c/lab-1/...` now works as admin or alice (K8s).
- Mocks: lab-1 has one credential + grants (admin RW, alice RO); tests needing a credential-less cluster call
  `clearClusterAccess('lab-1')` (exported via `@/test/handlers`).
