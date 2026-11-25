---
id: T-0335
title: Cluster Settings (Details, ClusterOperators tabs) and ClusterOperator details — read-only
status: done
owner: frontend-engineer
checkpoint: 5b
depends_on: [T-0331]
paths: [web/src/features/resources/cluster-settings, web/src/features/resources/registry/kinds/clusteroperators.tsx, web/src/features/resources/routes.tsx, web/src/mocks/k8s/clusterFixtures.ts, web/src/features/resources/registry/types.ts, web/src/features/resources/details/ResourceHeader.tsx, web/src/features/resources/details/ResourceDetailsPage.tsx, web/src/features/resources/list/ResourceDataView.tsx]
review_rounds: 2
---

## Goal
Lane O step 1: CS-1..3 — OCP's Cluster Settings page at `/c/<cluster>/settings/cluster` and the ClusterOperator kind.

## Scope
- In: Cluster Settings page (heading "Cluster Settings", tabs Details · ClusterOperators), its routes, the
  ClusterOperator descriptor (list columns, details, Related objects tab), status icon component.
- Out: Configuration tab, Update / Select a version / channel edit buttons (Q9, parity gaps); MachineConfigPools.

## Contract / design notes
- **Routes** (`routes.tsx`, under `c/:cluster`): `settings/cluster` (Details) and `settings/cluster/clusteroperators`,
  lazy page in `cluster-settings/ClusterSettingsPage.tsx`; tabs are router links like the engine details tabs. Path
  builder `clusterSettingsPath` exists (T-0331). Cluster without `config.openshift.io` → the engine's not-served state.
- **Data**: `useClusterVersion(cluster)` = `k8sGet(ClusterVersionModel, 'version')` + watch (existing single-object
  hook if the engine has one; key `['k8s', cluster, 'get', ClusterVersionModel key, 'version']`).
  T-0336 imports `useClusterVersion` and the CO status label directly from `cluster-settings/` (same feature, no barrel).
- **Details tab** (CS-2, OCP `cluster-settings.tsx` `ClusterSettingsPage` details, `cluster-version.tsx`):
  DescriptionList: Current version (`clusterVersionFacts().currentVersion`), Update status (from
  `shared/health:clusterUpdate` + OCP copy: "Up to date", "Available updates", "Updating to `<v>`" with the
  Progressing condition message as progress text, "Failing" with the Failing message), Channel (`spec.channel`,
  "Not configured" when empty), Cluster ID (`spec.clusterID`), Available versions (sorted list of
  `status.availableUpdates[].version`, read-only). "Update history" `Table` compact: Version, State, Started,
  Completed (`status.history`, Timestamp component). Forbidden read → inline Alert in the tab, not a blank page.
- **ClusterOperators tab** (CS-3, OCP `ClusterOperatorTabPage` / `ClusterOperatorList`): the generic list body for
  `ClusterOperatorModel` embedded in the tab (`ResourceListPage`'s table part — reuse the same pattern
  ResourcePodsTab uses to embed a list; no heading). Columns Name, Status (`OperatorStatusIconAndLabel` equivalent:
  `shared/health:clusterOperatorStatus` + OCP icons), Version (`clusterOperatorVersion`), Message (Progressing
  message when progressing, else Degraded/Available message as OCP `getStatusAndMessage`). **Default sort Name
  (parity wins over the CS-3 fleet tweak; OCP `cluster-operator.tsx` sorts by name)**; Status sortable by
  `HEALTH`-like severity (Degraded, Unavailable, Cannot update, Progressing, Unknown, Available). Status filter.
- **ClusterOperator descriptor** (`readOnly`, no `nav`): details = Status, Version, Message + Conditions table;
  tabs Details · YAML · Related objects (`KindTabs['related-objects']`): `status.relatedObjects` rows Name, Resource,
  Group, Namespace — `ResourceLink` when the registry has a descriptor for the group/resource, text otherwise
  (OCP `related-objects.tsx`). Breadcrumb "Cluster Settings > ClusterOperator details" as OCP.
- Fixture tweaks (operator messages, history entries) go in `clusterFixtures.ts` (Lane O owns it).

## Context pack
- Docs: spec §5b.3 CS-1..3, §7 Q9; FRONTEND.md § Routing, § The resource registry.
- Exemplars: `features/resources/events/` (non-kind page under `c/:cluster` with lazy route); `details/ResourcePodsTab.tsx`
  (embedded list); `components/ConditionsTable.tsx`; `registry/kinds/persistentvolumes.tsx` (descriptor with sections).
- Touch points: `shared/health/{clusterHealth,facts}.ts` (T-0330); `paths.ts:clusterSettingsPath` (T-0331).
- OCP reference: `/home/bad/works/openshift-console/frontend/public/components/cluster-settings/cluster-settings.tsx`
  (CurrentVersion, CurrentChannel, UpdatesProgress, ClusterOperatorTabPage L1783, tabs L1811–1823),
  `cluster-version.tsx`, `cluster-status.tsx`, `cluster-operator.tsx` (OperatorStatusIconAndLabel,
  ClusterOperatorList, ClusterOperatorDetails), `related-objects.tsx`.

## Acceptance criteria
- [x] CS-1: Administration > Cluster Settings opens Details; tab ClusterOperators at its own URL; hidden on `prod-k8s-1`.
- [x] CS-2: version, update status per scenario (`staging-eu-1` Updating, `prod-eu-1` Available updates), channel, cluster ID, history table; no update buttons.
- [x] CS-3: CO list columns/sort/filter; `dev-2` shows a Degraded operator; CO details with Conditions and Related objects; no Edit/Delete.
- [x] Tests: update-status rendering per scenario, CO list sort by status, related-object link vs text.
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-25 (frontend-engineer): Cluster Settings page + Details/ClusterOperators child routes, ClusterVersion details
  (version box, update status, channel, ID, available versions, history), CO descriptor (columns, severity sort,
  Status filter, details, Operand versions, Related objects tab). 8 tests; probe vs OCP on the 4 screens. A `listPath`
  breadcrumb hook was added and then reverted at the coordinator's request (no edits to engine files).
- 2026-11-25 (frontend-engineer, fix round 1): descriptor `listPath` + ResourceHeader `listTo` (CO breadcrumb → settings
  tab, tested); no Actions column for readOnly kinds without `useKindActions` (ResourceDataView, tested); Channel help
  popover; threshold text regular colour, margin 4px 0 24px; box gap 16px; routes/doc-comment nits. Re-probed.

## Review
- Round 1 (frontend-architect, 2026-11-25): **CHANGES_REQUESTED**. Gate: lint/typecheck/build ok; 5 load timeouts in
  unrelated files (GrantsTab, ResourceYamlTab, AppShell) pass in isolation; cluster-settings tests pass.
  Decisions: (a) do it this round (parity first, and the engine files are free now); (b) OCP copy accepted; (c) dev-1 +
  `mockK8s.upsert` accepted. Keep the EditDeploymentPage reformat (it's formatter output, harmless).
  Required:
  - registry/types.ts:~136 + details/ResourceHeader.tsx:30-35 + details/ResourceDetailsPage.tsx:207 — CO breadcrumb goes to the generic list, not OCP `breadcrumbsFor` (`cluster-operator.tsx:374`) — add descriptor `listPath?: (cluster: string) => string` (TSDoc), optional `listTo?: string` prop on ResourceHeader (default `resourcePath(...)`, label stays `model.labelPlural`), pass `descriptor.listPath?.(cluster)`; CO descriptor sets `listPath: (c) => clusterSettingsPath(c, 'clusteroperators')`; test the breadcrumb href; add one clause to FRONTEND.md § The resource registry (CP5b line); add the three files to `paths`.
  - registry/kinds/clusteroperators.tsx:23-25 — doc comment has a stale "(until the engine gets a list-path hook)" parenthetical and an over-long line — rewrite once `listPath` lands.
  - routes.tsx:145-146 — `clusterSettingsRoute` was inserted below the "Home → Search (SRCH-1)" comment, so the comment no longer describes the next line — move `clusterSettingsRoute` above the comment.
  Optional (nits):
  - cluster-settings/ClusterSettingsPage.tsx:41-53 — hand-rolls the not-served EmptyState that `list/ResourceListPage.tsx:16 PageEmptyState` already does; you could move PageEmptyState to `components/` and reuse it here (and add the file to `paths`).
  - cluster-settings/RelatedObjectsTab.tsx:19 — `descriptorForPlural` lookup is by plural only, so if two groups share a plural it falls back to text. That's acceptable for now; a comment would help.
- 2026-11-25 ux-designer, round 1: **CHANGES_REQUESTED**. Probe @1280 vs ref `/settings/cluster`, `/clusteroperators`, CO `authentication` (+ related-objects).
  Matches: h1, tabs, breadcrumb, settings box geometry/padding (800px, sections, dt/dd), Available-updates icon colour, CO details 2-col DL, Conditions, Related objects toolbar/table offsets, Update history table rows (38px).
1. Details — "There is a threshold…" intro is subtle grey with no top margin (ours rgb(77,77,77), margin 0 0 24px) — OCP `cluster-settings.tsx` L1718 `<Content><Content p className="help-block pf-v6-u-mb-lg">` = regular text colour rgb(21,21,21), margin 4px 0 24px — drop `pf-v6-u-text-color-subtle`, wrap in `<Content>` like OCP.
2. Details — gap settings box → Cluster ID list is 24px — OCP 16px (box bottom 434 → Subscription DL 450; `.co-cluster-settings` has no margin in `_cluster-settings.scss` L187) — `.settings` margin-bottom → `--pf-t--global--spacer--md`.
3. Details — "Channel" term is plain — OCP `ChannelHeader` (L308) is `DescriptionListTermHelp` (dashed underline + popover "Channels help to control the pace of updates and recommend the appropriate release versions. Update channels are tied to a minor version…") — add `DescriptionListTermHelpText` + Popover; no product name, example "4.18".
4. ClusterOperators tab — empty sticky Actions column (`th` "Actions", `pf-m-border-left`) after Message — OCP `cluster-operator.tsx` L83 `tableColumnInfo` has 4 columns, no kebab — don't pass `rowActions` when the descriptor is `readOnly` and has no `useKindActions` (`list/ResourceDataView.tsx` L142, engine file: coordinator may split it into a follow-up).
- 2026-11-25 ux-designer, round 2: **APPROVE**. 1 intro `p` inside `pf-v6-c-content`, colour/margin match OCP (probe 0 diffs). 2 box → Cluster ID DL gap 16px = OCP. 3 Channel = help-text term, popover header "Channel" + body as OCP `DescriptionListTermHelp`, Esc closes. 4 CO list headers Name|Status|Version|Message, no Actions column. 5 breadcrumb → `/c/<c>/settings/cluster/clusteroperators`.
5. (follow-up, non-blocking) CO details breadcrumb "ClusterOperators" → `/c/<c>/k8s/cluster/clusteroperators` — OCP `breadcrumbsFor` → `/settings/cluster/clusteroperators` — descriptor `listPath` hook, as noted in Handover.
- Round 2 (frontend-architect, 2026-11-25): **APPROVE**. All round-1 findings are fixed: the `listPath`/`listTo` hook is in
  (TSDoc, FRONTEND.md clause, breadcrumb href test), `clusterSettingsRoute` now sits above the Search comment, and the
  descriptor doc is rewritten. New `ResourceDataView` rule (no Actions column for `readOnly` without `useKindActions`) is
  correct (OCP ClusterOperatorList has no kebab) and safe: before it, those kinds showed an empty kebab. It also affects
  MachineSets, Machines and CSVs (readOnly, no kind actions yet); the column comes back automatically when their tasks add
  `useKindActions`. Gate taken from the engineer's green check-fe (round 2 verifies listed fixes only).

## Handover notes
- Files: `cluster-settings/{ClusterSettingsPage,ClusterVersionDetails,ClusterUpdateStatus,ClusterOperatorsTab,
  ClusterOperatorDetails,RelatedObjectsTab,ClusterOperatorStatusLabel}.tsx`, `clusterUpdateView.ts`,
  `useClusterVersion.ts`, `clusterSettingsContext.ts`, CSS module; `registry/kinds/clusteroperators.tsx`; `routes.tsx`.
  No fixture changes and no files outside `paths`.
- T-0336 imports `useClusterVersion`, `ClusterOperatorStatusLabel`, `CLUSTER_OPERATOR_STATUS_ORDER` and `clusterUpdateView`.
- Copy follows OCP over the contract: "Update to <v> in progress", "Last completed version" while updating.
- Fix round 1: descriptor `listPath?(cluster)` → `ResourceHeader` `listTo` (CO breadcrumb → Cluster Settings tab);
  `ResourceDataView` omits row actions for `readOnly` kinds without `useKindActions` (only ClusterOperators today;
  pods etc. keep Actions, test in `ResourceListPage.test`); FRONTEND.md § registry CP5b line names both.
- Tests: no test persona can reach `dev-2` (it is disabled; only carol has a grant), so the CO tests mark `ingress`
  Degraded on dev-1 via `mockK8s.upsert`. alice is used for prod-eu-1 and staging-eu-1. The fixtures have no
  "Up to date" or "Failing" cluster, so `clusterUpdateView` covers those with unit tests.
- Probe: only data widths differ, plus the engine's resizable name column (padding-right 28px vs 16px, on every list).
- Not-served (`prod-k8s-1`): EmptyState in the style of the engine; nav hiding is already covered in `useClusterNav.test`.
