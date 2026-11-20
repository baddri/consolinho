---
id: T-0075
title: Generic resource details page — header, Details tab, Events tab, Pod and ConfigMap sections
status: todo
owner: frontend-engineer
checkpoint: 2
depends_on: [T-0073]
paths: [web/src/features/resources/details/, web/src/features/resources/events/, web/src/features/resources/yaml/, web/src/features/resources/registry/kinds/pods.tsx, web/src/features/resources/registry/kinds/configmaps.tsx, web/src/features/resources/routes.tsx, web/src/features/resources/index.ts]
review_rounds: 0
---

## Goal
One details page for every registered kind (UI-4, UI-5, UI-10, US-6): OCP-style header, Details · YAML · Events tabs
as URL segments, live object data, the common metadata section plus kind-specific sections for Pods and ConfigMaps.
The YAML tab is a read-only view here; T-0077 turns it into the editor.

## Scope
- In: `details/{ResourceDetailsPage,ResourceHeader,MetadataSection,useResourceTab}.tsx`, `events/ResourceEventsTab.tsx`,
  `yaml/ResourceYamlView.tsx` (interim read-only YAML in a PF `CodeBlock`, managedFields stripped), `PodDetails` and
  `ConfigMapDetails` sections registered as `DetailsSection`, details routes (index/details, `yaml`, `events` with
  route `handle: { tab }`) replacing the placeholder.
- Out: Actions dropdown content (T-0076 — leave a header slot), YAML editing (T-0077), other kinds' sections (T-0078),
  Logs/Terminal tabs (CP4, must not appear).

## Contract / design notes
- Data: `useK8sGet(cluster, model, namespace, name)` (live, T-0071). Errors: `Kubernetes.NotFound` → EmptyState
  "`<Kind>` `<name>` not found on `<cluster>`" with a link to the kind's list in that namespace (SW-9 landing on a
  missing object); `Kubernetes.Forbidden` → "Restricted access" (`ResourceErrorState` from T-0073); `Proxy.*`/other →
  `ErrorState` + Retry; pending → skeletons. Object deleted while open → the 404 state. Check `error` **before**
  `data`: after a DELETED event TanStack keeps the stale `data` next to the 404 `error` (ADR-0022 §6).
- Header (spec §5): PF `Breadcrumb` `Projects › <ns> › <Kinds> › <name>` (cluster-scoped: `<Kinds> › <name>`), title
  `KindBadge` + name + `ResourceStatusLabel` (from `descriptor.status`), right-aligned actions slot; PF `Tabs` with
  link tabs (Details, YAML, Events — Events hidden when `hasEventsTab === false`).
- `useResourceTab()`: reads the deepest match's `handle.tab` like `useAdminTab` (copy the 15 lines — admin internals
  are not importable).
- `MetadataSection` (PF `DescriptionList`): Name, Namespace (link to the namespace's project/namespace details),
  Labels (PF `LabelGroup` of all labels), Annotations ("N annotations", PF `ExpandableSection` listing key=value),
  Created (`RelativeTime`), Owner references (`ResourceLink` if `descriptorForKind` knows the kind, else text).
- Pod section: phase, node, pod IP(s), QoS class; containers table (name, image, state + reason, ready, restarts,
  last termination reason / exit code). ConfigMap section: each `data` key with its value in a read-only `CodeBlock`;
  `binaryData` keys listed with decoded size (e.g. "1.2 KiB").
- Events tab (UI-5): `useK8sList(cluster, EventModel, { namespace: obj.metadata.namespace, fieldSelector:
  'involvedObject.uid=' + uid })`, live, newest first, `eventColumns({ withInvolvedObject: false })` from T-0073;
  empty: "No events — events are kept for about an hour by default."
- Lazy route modules per tab are fine; the YAML route must stay its own lazy module (T-0077 adds Monaco there).

## Context pack
- Docs: spec §4.8 UI-4, UI-5, UI-10, §5 "Page header"; ADR-0023 §1/§3.
- Exemplars: `web/src/features/admin/clusters/ClusterDetailPage.tsx:L45-L118` (link tabs, not-found state, tab panel),
  `web/src/features/admin/adminTabs.ts:L16-L34` (`useAdminTab` to copy), `web/src/features/admin/clusters/ClusterDetailHeader.tsx:ClusterBreadcrumb`,
  `web/src/features/admin/clusters/ClusterDetailsTab.tsx` (DescriptionList layout).
- Touch points: `web/src/features/resources/routes.tsx` (details routes from T-0073),
  `web/src/features/resources/registry/kinds/{pods,configmaps}.tsx` (set `DetailsSection`),
  `web/src/features/resources/components/*` (T-0073: `KindBadge`, `ResourceLink`, `ResourceStatusLabel`,
  `ResourceErrorState`), `web/src/features/resources/registry/kinds/events.tsx:eventColumns`, `web/src/shared/ui:RelativeTime`,
  `web/src/shared/k8s:useK8sGet|useK8sList|EventModel`; fixtures: the CrashLoopBackOff pod in `shop` (T-0070).

## Acceptance criteria
- [ ] UI-4: pod details show common metadata + containers table with `CrashLoopBackOff` reason, restarts and last
      exit code; ConfigMap shows each key's value and binary key sizes; owner link resolves for registered kinds.
- [ ] UI-5: Events tab lists only the object's events (field selector sent), newest first, live; empty text exact.
- [ ] Tabs are URL segments: `/…/web-1/events` reloads onto Events; no Logs/Terminal tab.
- [ ] UI-10: 404 (incl. after switching to a cluster without the object) shows the not-found state with a list link;
      403 restricted; 502 detail + Retry.
- [ ] Out-of-band modification via `mockK8s.upsert` updates the Details tab.
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
