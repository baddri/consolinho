---
id: T-0113
title: Resource details pages — OCP heading, breadcrumb, two-column details, page tabs, YAML and events tabs
status: todo
owner: frontend-engineer
checkpoint: CP3.5
depends_on: [T-0110, T-0112]
paths: [web/src/features/resources/details, web/src/features/resources/yaml, web/src/features/resources/events, web/src/features/resources/registry, web/src/features/resources/components]
review_rounds: 0
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
- [ ] `/c/dev-1/k8s/ns/shop/deployments/web` at 1280 and 1920: project bar, breadcrumb "Deployments › Deployment details",
      "D web" h1 with outlined status, Actions right; tabs aligned with the title.
- [ ] Details tab: "Deployment details" h2, two columns at 1280; no term wraps over 2 lines.
- [ ] Pod details: same layout; CrashLoopBackOff shows red icon + text in the title.
- [ ] Events tab empty: small empty state, no orphan table header.
- [ ] YAML tab: editor reaches the bottom of the content card; buttons below it.
- [ ] Both themes checked.
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
