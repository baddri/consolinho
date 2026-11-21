---
id: T-0113
title: Resource details pages — OCP heading, breadcrumb, two-column details, page tabs, YAML and events tabs
status: done
owner: frontend-engineer
checkpoint: CP3.5
depends_on: [T-0110, T-0112]
paths: [web/src/features/resources/details, web/src/features/resources/yaml, web/src/features/resources/events, web/src/features/resources/registry, web/src/features/resources/components]
review_rounds: 1
---

## Goal
`/c/:cluster/k8s/.../:name[/yaml|/events]` look like OCP details pages.

## Scope
- In: `ResourceDetailsPage`, `ResourceHeader`, `ResourceDetailsTab`, `MetadataSection`, kind `DetailsSection`s,
  YAML tab layout, events empty state.
- Out: new fields/sections (pod ring, containers table → CP4), events streaming redesign (CP5).

## Contract / design notes
Findings:
- Deployment details — breadcrumb "Projects › shop › Deployments › web" — OCP `breadcrumbsForDetailsPage`:
  "Deployments › Deployment details" — **Decided**. Two crumbs: `{ label: model.labelPlural, to: resourcePath(list
  in the same namespace, or cluster-scoped list) }`, `{ label: model.label + " details" }` (current, no link).
  Supersedes CP2 spec §5 "Page header" breadcrumb (`docs/specs/CP2-proxy-and-resource-browser.md` L240) — note only.
- Details pages — no project bar — OCP shows the namespace bar on details pages too — reuse T-0112's project bar
  (changing project goes to the list of that project).
- Header — status as filled orange label "2 of 3 pods" — OCP title status is icon + text in an outlined label —
  `ResourceStatusLabel asLabel` (adapter from T-0112) in `PageHeading status`; `icon={<KindBadge model={model}/>}`;
  `actions=` the existing Actions dropdown. `ResourceHeader` becomes a thin wrapper over `PageHeading` (delete
  `ResourceBreadcrumb`).
- Details tab — single stacked column, horizontal terms ("Desired replicas 3", "Updated / replicas") mixed with vertical
  ones — OCP `DeploymentDetails`: `SectionHeading` + `Grid` two `GridItem sm={6}`, vertical `DescriptionList` — left
  `MetadataSection` (Name, Namespace, Labels, Annotations, Created, Owner), right the kind's `DetailsSection`.
- Tabs — misaligned 20 px left of the heading — `PageTabs` (T-0110) replaces `ResourceTabs` (L176-216); tab content
  in `PageBody` (`isFilled` for the YAML tab).
- Labels — blue filled pills — OCP `LabelList`: `LabelGroup` of outlined/grey labels `key=value` — match.
- Events tab — empty message is a large heading inside a table with column headers — OCP `EmptyBox`-style
  `EmptyState variant="sm"` "No events" without an empty table header.
- YAML tab — check editor fills the content height and Save/Reload/Cancel sit below it (OCP `edit-yaml.tsx`).
- Not found (`.../deployments/nope`) — keep heading with breadcrumb + EmptyState "404: Not found" style.

## Context pack
- Docs: `docs/architecture/UX.md` §3, §4, §6, §7.
- Touch points: `web/src/features/resources/details/ResourceHeader.tsx:ResourceHeader` (+ `ResourceBreadcrumb` L29),
  `web/src/features/resources/details/ResourceDetailsPage.tsx` (`ResourceDetails` L114-145, `ResourceTabs` L176-216),
  `web/src/features/resources/details/ResourceDetailsTab.tsx:ResourceDetailsTab`,
  `web/src/features/resources/details/MetadataSection.tsx` (`Labels` L20, `MetadataSection` L67),
  `web/src/features/resources/details/sections/{PodDetails,ConfigMapDetails}.tsx`, deployment section in
  `registry/kinds/deployments.tsx`, `web/src/features/resources/events/ResourceEventsTab.tsx`,
  `web/src/features/resources/yaml/ResourceYamlTab.tsx`, `web/src/features/resources/paths.ts:resourcePath`.
- Exemplar to copy: OCP-like two columns = `DetailsGrid` + two `DetailsColumn` (T-0110); left column is today's
  `MetadataSection` items, right column the kind's `DetailsSection`.
- Tests: `web/src/features/resources/details/ResourceDetailsPage.test.tsx` L79-90 (asserts crumbs "Projects", "shop",
  "Pods" → now "Pods" link + current "Pod details"), status label queries, tab queries (now `role="tab"` inside
  `navigation`); `sections/*.test.tsx` and `events/*.test.tsx` if they query a horizontal list or the empty table;
  `web/e2e/browse.e2e.ts` (breadcrumb clicks). Convention: `renderApp(path)` + `mockK8s.*` (FRONTEND.md § "Testing").
- Conflicts: `resources/registry`, `resources/components` with T-0112 (runs after it). Must not touch
  `resources/actions` (T-0116). Parallel-safe with T-0111, T-0114, T-0115, T-0116.
- OCP: `public/components/deployment.tsx:DeploymentDetails` (L95-140), `public/components/utils/details-page.tsx:ResourceSummary`,
  `public/components/utils/horizontal-nav.tsx`, `public/components/edit-yaml.tsx`, `public/components/pod.tsx` (PodDetails).

## Acceptance criteria
- [x] `/c/dev-1/k8s/ns/shop/deployments/web` at 1280 and 1920: project bar, breadcrumb "Deployments › Deployment details",
      "D web" h1 with outlined status, Actions right; tabs aligned with the title.
- [x] Details tab: "Deployment details" h2, two columns at 1280; no term wraps over 2 lines.
- [x] Pod details: same layout; CrashLoopBackOff shows red icon + text in the title.
- [x] Events tab empty: small empty state, no orphan table header.
- [x] YAML tab: editor reaches the bottom of the content card; buttons below it.
- [x] Both themes checked.
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-21 frontend-engineer: started; read UX.md §3/4/6/7, T-0110/T-0112 handover.
- 2026-11-21 frontend-engineer: PageHeading/PageTabs/DetailsGrid adoption, descriptor `ExtraSections`, events EmptyState,
  filled YAML tab; screenshots (Pod/Deployment/ConfigMap/Project, YAML, Events, 404; light+dark, 1280+1920) OK;
  `scripts/check-fe.sh` green.
- 2026-11-21 frontend-engineer: round 1 — `DetailsColumn aria-label`, `PageBody` (no wrapper when filled, role/aria-label)
  for tab content, project-bar tests, Pod "Status" icon+text, absolute `Timestamp` for Created, ConfigMap data as DL;
  re-screenshotted; check-fe green (719).

## Review
### Visual review (ux-designer, 2026-11-21) — APPROVE
Checked Pod (Running + CrashLoopBackOff), Deployment, ConfigMap (text + binary), Project, YAML, Events (empty + rows),
404; light+dark, 1280+1920. No horizontal overflow; no dt wraps; tab text aligned with h1 text; crumbs "<Kinds> › <Kind> details".
- All ACs met: project bar, KindBadge h1 + outlined status (CrashLoopBackOff red icon), Actions right, two columns, events `EmptyState sm`, YAML editor fills card with buttons below.
- Follow-up (minor, out of scope): Pod details right column shows "Phase: Running" next to CrashLoopBackOff title — OCP `PodDetailsList` shows "Status" with the computed pod status icon — CP4 pod details.
- Follow-up (minor): ConfigMap data keys render as headings close to the "Data" h2 size — OCP `ConfigMapDataView` uses a `DescriptionList` (key as bold term, value as code block) — CP4.
- Follow-up (minor): YAML tab has Save/Reload but no Cancel; Save disabled until dirty — OCP `edit-yaml.tsx` shows Save/Reload/Cancel, Save always enabled — note for CP4 YAML work.
- Follow-up (minor): "Created" is relative ("last month") — OCP `Timestamp` shows absolute date/time with globe icon for older items — shared timestamp task.
- 2026-11-21 frontend-architect: **CHANGES_REQUESTED** (round 1). Contract split `DetailsSection`/`ExtraSections` +
  `DetailItem.tsx` deletion approved; FRONTEND.md "The resource registry" updated by the architect. check-fe green (717).
  - `web/src/shared/ui/page/DetailsGrid.tsx:20` — `DetailsColumn` has no accessible name, so the tab hand-rolls a copy
    (`details/ResourceDetailsTab.tsx:10` `LabelledColumn`) — add optional `'aria-label'?: string` to `DetailsColumn`
    (passed to `DescriptionList`), delete `LabelledColumn`, use `DetailsColumn` (+ one assertion in `pageBlocks.test.tsx`).
  - `web/src/shared/ui/page/PageBody.tsx:15` — `isFilled` keeps PF's body wrapper, so the details page bypasses
    `PageBody` (`details/ResourceDetailsPage.tsx:194` raw `PageSection` + `hasBodyWrapper`) — make `PageBody` pass
    `hasBodyWrapper={!isFilled}` and accept `role?` + `'aria-label'?`; render the tab content as
    `<PageBody isFilled={isYaml} role="tabpanel" aria-label={TAB_TITLES[tab]}>`; fix the TSDoc of `ResourceTabs`.
  - `details/ResourceDetailsPage.test.tsx` — new behaviour "project bar on details pages of namespaced kinds,
    selecting a project goes to that project's list" is untested — add one test (bar present on a pod, absent on a
    Namespace/Project details page; selection navigates to `/c/dev-1/k8s/ns/<other>/pods`).
  - Nits (optional): `DetailsSubsection` is kind-agnostic and imported by `registry/kinds/*` — could live in
    `shared/ui/page` next to `SectionHeading`; `ResourceDetails` TSDoc line at `ResourceDetailsPage.tsx:106` exceeds width.
- 2026-11-21 frontend-architect: **APPROVE** (round 2). All 3 required items done (`DetailsColumn aria-label`,
  `PageBody isFilled`/`role`/`aria-label` used by every tab, project-bar tests). Extra changes also OK: Pod Status
  column, `Timestamp`, ConfigMap data as a DL. check-fe green (719).
  - Nits (optional, follow-up): `resources/components/Timestamp.tsx` is kind-agnostic; move it to `shared/ui` next to
    `RelativeTime`, add a unit test (absolute text, relative tooltip, "—"/unparseable). `DetailsSubsection` could move too.

## Handover notes
- Descriptor contract split (`registry/types.ts`): `DetailsSection` = right-column `DetailsItem`s only; new
  `ExtraSections` = full-width sections below the grid, each a `details/sections/DetailsSubsection` (h2 + region).
  `registry/kinds/DetailItem.tsx` deleted (shared `DetailsItem`). FRONTEND.md L113 descriptor shape needs `ExtraSections`.
- Shared `DetailsColumn` takes `aria-label` ("Metadata" / "<Kind> details"); `PageBody isFilled` drops PF's body
  wrapper (filled children can reach the bottom) and takes `role`/`aria-label`; tab content = `PageBody role="tabpanel"`.
- Pod right column "Status" = `ResourceStatusLabel` via `PodDetailsSection` wrapper in `pods.tsx` (no import cycle).
- Created uses `resources/components/Timestamp` (absolute text, relative tooltip); list cells keep `RelativeTime`.
- Events empty: `EmptyState sm` "No events" + body "Events are kept for about an hour by default." (UI-5 text split;
  `NO_EVENTS_TITLE/BODY` replace `NO_EVENTS_TEXT`).
- ConfigMap data = vertical DL (key term, code block value); binary data a compact table; labels outlined grey.
- ProjectBar shown on details pages of namespaced kinds (selection → that project's list). e2e unchanged (tabpanel name kept).
