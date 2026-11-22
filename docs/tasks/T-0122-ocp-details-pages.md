---
id: T-0122
title: OCP parity — resource details pages (heading, DescriptionList fields, labels, deployment pod ring)
status: done
owner: frontend-engineer
checkpoint: 3.6
depends_on: [T-0121]
paths: [web/src/features/resources/details, web/src/features/resources/components, web/src/shared/ui]
review_rounds: 3
---

## Goal
Pod, Deployment, ConfigMap, Service and Project details must match OCP's heading and Details tab. Absorbs T-0118 item 5
and the `Timestamp`/`DetailsSubsection` move of item 10.

## OCP reference
- Routes: `/k8s/ns/openshift-console/pods/<pod>`, `/k8s/ns/openshift-console/deployments/console`.
- Source: `public/components/utils/headings.tsx` (title block L160-185), `packages/console-dynamic-plugin-sdk/src/app/
  components/utils/resource-status.tsx` + `.scss`, `public/components/utils/details-page.tsx:ResourceSummary`
  (L75-160), `public/components/utils/details-item.tsx`, `public/components/utils/label-list.tsx`,
  `public/components/utils/_label.scss`, `public/components/pod.tsx` (L300-440), `public/components/deployment.tsx`
  (`DeploymentDetailsList` L45-90, `DeploymentDetails` L95-135), `packages/console-shared/src/components/pod/PodRingSet.tsx`.

## Differences to fix
1. Heading — small pale badge, status as outlined compact `Label` with green check — OCP: `co-m-resource-icon--lg`
   badge (T-0121), name, status as PF `Badge isRead` wrapping status icon + text, `padding-left: spacer--sm`
   (`resource-status.scss`) — mirror. Star (T-0120) left of "Actions".
2. Deployment heading — "2 of 3 pods" label — OCP shows no status in the Deployment heading; status is a "Status" row
   ("Up to date"/"Updating") in the left column — move it.
3. Deployment details — no pod ring; right column lists replica counts — OCP: `PodRingSet` donut (pod count, read-only;
   no scale arrows since we have no scale action), right column "Update strategy", "Max unavailable" ("1 of 2 pods"),
   "Max surge", "Progress deadline seconds", "Min ready seconds"; then sections Containers, Volumes, Conditions, each
   with `SectionHeading`, each in its own padded section — mirror field order and copy from `deployment.tsx`.
4. Pod details — right column Node/Pod IP/QoS — mirror `pod.tsx` order: Status, Restart policy, Active deadline
   seconds, Pod IP, Host IP, Node, Image pull secret…; sections Containers, Volumes, Conditions.
5. Common metadata — "Created" — OCP `ResourceSummary`: Name, Namespace, Labels, Pod selector/Node selector/Tolerations
   (when relevant), Annotations, "Created at", Owner — mirror labels and order.
6. Namespace field — `PR` badge [T-0118 #5] — `NS` badge (Namespace colour); Projects nav keeps `PR`.
7. Labels — outlined compact labels — OCP `LabelGroup numLabels={20} defaultIsOpen` of default filled `Label`s with
   `href` to search (`key=value`), inside a box with border `--pf-t--global--border--width--regular` solid
   `--pf-t--global--border--color--default`, radius `--small`, padding `--xs` (`_label.scss` `.co-editable-label-group`);
   empty → "No labels" in `pf-v6-u-text-color-subtle`. No "Edit" link (no label editing feature).
8. Field help popovers (dashed term underline, OpenAPI descriptions) — out of scope; follow-up task.
9. Move `Timestamp` and `DetailsSubsection` to `shared/ui` with a unit test [T-0118 #10].
10. Tabs spacing (from T-0120 visual review) — our details tabs sit 26px below the heading, OCP 22px — match OCP.

## Context pack
- Docs: `UX.md` §3, §6.
- Touch points: `web/src/features/resources/details/ResourceHeader.tsx`, `MetadataSection.tsx`,
  `sections/PodDetails.tsx`, `sections/ConfigMapDetails.tsx`, `sections/DetailsSubsection.tsx`;
  `web/src/shared/ui/LabelList.tsx`, `shared/ui/page/DetailsGrid.tsx`, `SectionHeading.tsx`;
  `features/resources/components/Timestamp.tsx`.
- PF: `Badge isRead`, `DescriptionList`, `Grid`/`GridItem sm={6}`, `LabelGroup`, `Label href`, `ChartDonut` only if
  already a dependency (else a PF-token SVG ring; frontend-architect decides).

## Acceptance criteria
- [x] Side-by-side pod details and deployment details vs the OCP routes above match at 1280 in light and dark.
- [x] Field labels/order equal OCP's for Pod and Deployment (unit test on the descriptor output).
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-22 frontend-engineer: started (together with T-0129); read OCP refs + rendered pod/deployment details.
- 2026-11-22 frontend-engineer: done. OCP ResourceSummary/Pod/Deployment fields, pod ring, Containers/Volumes/Conditions
  sections, Pods tab, ReplicaSet kind, lg badge + read-Badge status, shared Timestamp/DetailsSubsection/ResourceLabels.
  Tab gap measured 21.8px = OCP. check-fe green (778 tests). AC1: light side-by-side done; dark not screenshotted.
- 2026-11-22 frontend-engineer: fix round 1. Kind badge inside the h1 (`PageHeading` icon, baseline flex), tab links
  xs block padding (`PageTabs.module.css`, bar 45px), Node selector "No selector", ring "Pods" 14px subtle. Measured vs
  OCP at 1280 light + dark: name gap 7px, badge weight 600, badge offset, tab height 45px all equal. check-fe green.
- 2026-11-22 frontend-engineer: fix round 2. Heading status badge gets the heading font + line height
  (`PageHeading.module.css .status`, OCP `resource-status.scss`). 1280 light/dark vs OCP: Red Hat Display 600, 15.6px
  tall (OCP 16.6), centre 1.5px below the title centre (OCP 2.3px). check-fe green.

## Review
### Code (frontend-architect)
APPROVE (round 1). check-fe green, 778 tests.
- Pod ring: accept the hand-made SVG. `@patternfly/react-charts` would add Victory (a large dependency tree, roughly
  100 KB+ gzip even when tree-shaken) for one read-only donut. `PodRing.tsx` is about 90 lines of plain arcs with no DOM
  access, and its logic (`podRing.ts`) is pure and unit-tested. Revisit when CP metrics need real charts: then adopt
  react-charts and swap `Ring` for `ChartDonut`.
- Out-of-path edits are justified and minimal: `ReplicaSetModel`/type, the `pods` tab (`hasTab` guard + redirect for
  kinds without `podsSelector`), and `ResourceDataView` (a pure extraction). `k8sQueryKeys.list` includes the cluster.
  The ring and the Pods tab build the same `labelSelector` string, so they share one query/watch (no duplicate).
- Nit (optional): `podsSelector`/`PodRing` use only `matchLabels`. A matchExpressions-only selector lists every pod in
  the namespace (`ResourcePodsTab.tsx:16` `?? {}`). This limitation already existed (`labelSelectorString`); file a follow-up.
- Nit (optional): `RING_COLORS` hex could be PF chart tokens (`--pf-t--chart--color--blue--300`…); hex mirrors OCP, OK.
- Round 2: APPROVE. `PageHeading` icon inside the h1: the only caller (`ResourceHeader.tsx:35`) passes `KindBadge`, which
  is `aria-hidden` (`KindBadge.tsx:45`), so the h1's accessible name is still the object name. `.title` applies only
  when an icon is present. The `PageTabs.module.css` padding override (PF 6.7.0 `--pf-v6-c-tabs__link--PaddingBlock*`,
  a public component variable) for every PageTabs, admin included, is intended: one tab look app-wide, as OCP has.
- Round 3: APPROVE. `.status` (heading font family/line height, token-based, OCP `resource-status.scss` cited) on the
  status `FlexItem` (`PageHeading.tsx:139`); applies to every heading status (list paused indicator, admin) — intended.

### Visual (ux-designer)
CHANGES_REQUESTED (round 1). Pod + deployment details, Pods tab, 1280/1920, light/dark vs the reference console.
- Match: ResourceSummary rows and order, "Created at", Owner (RS link), NS badge, labels box, pod/deployment right
  columns, Status row, Containers/Volumes/Conditions sections, Pods tab (`details-page.tsx` L75-160, `pod.tsx`, `deployment.tsx`).
- Heading badge — the `lg` kind badge sits outside the h1: name starts 15px after it (OCP 7px), letter weight 400
  (OCP 600, inherited from the h1), badge 3px too high — OCP `utils/headings.tsx` renders `co-m-resource-icon--lg`
  inside the h1 (`_resource.scss` margin-right 7px) — render the icon inside the h1 (or gapNone + inherit weight + baseline).
- Tabs [#10] — heading→tabs gap is 21.8px = OCP, but tab links have 8px block padding (bar 53px) vs OCP 4px (45px), so
  underline and content sit 8px lower — OCP ships PF 6.6 (`tabs.css` `__link--PaddingBlockStart: spacer--xs`), we run 6.7
  — set `--pf-v6-c-tabs__link--PaddingBlock{Start,End}: var(--pf-t--global--spacer--xs)` on the details `PageTabs`, comment why.
- Empty Node selector shows "-" — OCP `utils/selector.tsx:38` shows "No selector" in `pf-v6-u-text-color-subtle` — mirror
  (same for an empty Pod selector).
- Pod ring — same 130px size, stroke and `podColor` colours as OCP `PodRing`, OK. Minor: "Pods" is 12px and the same colour
  as the count — OCP subtitle 14px in `text-color-subtle`, a little more line spacing — fix with the items above.
- Non-blocking: Annotations is an expandable list where OCP shows "N annotations" (plain text for users who cannot edit);
  container names are plain text (OCP links to the container page, which we lack). Accept for now.

CHANGES_REQUESTED (round 2). Pod/deployment details + `/admin/users/alice`, 1280, light/dark vs the reference console.
- Fixed: kind badge in the h1 (7px gap, weight 600, 8px top offset = OCP); tab bar 45px, links 4px/8px = OCP; admin user
  tabs unchanged otherwise; "No selector" subtle; ring "Pods" 14px subtle, same as OCP in both themes.
- Heading status badge (missed in round 1) — its text is Red Hat Text 12px (badge 18px tall, baseline-aligned), so "Running"
  looks heavier and sits 2px high — OCP's badge is inside the h1 and inherits Red Hat Display (16.6px tall,
  `vertical-align: middle`, `resource-status.scss`) — give the status badge the heading font family
  (`--pf-t--global--font--family--heading`) and centre it on the title line. Round 3 only needs a heading crop check.

APPROVE (round 3). Pod heading crop at 1280, light and dark, vs the reference `/k8s/ns/openshift-console/pods/<pod>`.
- Status badge now Red Hat Display 600 12px like OCP (`resource-status.scss`, badge inside the h1); top offset 9.3px vs
  OCP 9.6px, height 15.6 vs 16.6px, centre within 1px. Not visible side by side; accepted, no hand-tuned padding.

## Handover notes
- Descriptor additions (`registry/types.ts`): `summary` (podSelector/nodeSelector/tolerations/Extra rows in OCP
  ResourceSummary order), `DetailsTop` (pod ring), `hideHeadingStatus` (workloads), `podsSelector` (adds a Pods tab).
- Shared: `shared/ui/{Timestamp,formatTimestamp,ResourceLabels,page/DetailsSubsection,kind-badge/kindLabelColor}`;
  `StatusIconText asLabel` is now a read PF `Badge` (OCP `ResourceStatus`); admin labels follow.
- New `components/{ConditionsTable,ContainersTable,VolumesTable,PodRing,podRing}`; `PodRing` is a hand-made SVG
  (no `@patternfly/react-charts` dependency) with OCP `podColor` hex colours.
- `list/ResourceDataView.tsx` hook extracted from `ResourceListPage` so the Pods tab reuses ConsoleDataView.
- Out of task paths: `shared/k8s` ReplicaSetModel/type, mock fixtures (RS, volumes, limits), paths/routes/useResourceTab
  for the `pods` tab, admin label comments.
- Not done: field help popovers (#8), metrics, ring scale buttons. `PageHeading` puts `icon` inside the h1
  (pass an `aria-hidden` icon); the tab padding applies to every `PageTabs` (admin details too).
