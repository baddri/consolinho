---
id: T-0300
title: CP5a foundation — models, Storage nav section, minimal descriptors, ListActions slot, mock fixtures
status: todo
owner: frontend-engineer
checkpoint: 5a
depends_on: []
paths: [web/src/shared/k8s/models.ts, web/src/shared/k8s/types.ts, web/src/shared/k8s/index.ts, web/src/mocks/k8s, web/src/features/resources/registry/registry.ts, web/src/features/resources/registry/types.ts, web/src/features/resources/registry/kinds/routes.tsx, web/src/features/resources/registry/kinds/ingresses.tsx, web/src/features/resources/registry/kinds/networkpolicies.tsx, web/src/features/resources/registry/kinds/persistentvolumeclaims.tsx, web/src/features/resources/registry/kinds/persistentvolumes.tsx, web/src/features/resources/registry/kinds/storageclasses.tsx, web/src/features/resources/nav/useClusterNav.ts, web/src/features/resources/nav/useClusterNav.test.tsx, web/src/features/resources/list/ResourceListPage.tsx, docs/architecture/FRONTEND.md]
review_rounds: 0
---

## Goal
Plumbing every CP5a kind task needs, done once (T-0189 precedent) so the two lanes own disjoint files afterwards:
seven models, types, the Storage nav section (NAV-1/2, closes CP3.6 W5), a **minimal** descriptor per new kind, the
`ListActions` heading slot Create Project needs, and all mock API data for CP5a (fixtures, ProjectRequest create,
PVC resize). Lane tasks then fill in their own `kinds/<plural>.tsx` and feature folder only.

## Scope
- In: models + types, `K8S_MODELS`, `NavSectionId` + `SECTIONS`, six minimal descriptors registered, `ListActions`
  descriptor field rendered by the list page, mock fixtures/discovery/ProjectRequest/PVC resize, FRONTEND.md lines.
- Out: kind columns/details/actions (T-0301…T-0309); per-object Pods tab rule (T-0301); Search (automatic).

## Contract / design notes
- **Models** (`shared/k8s/models.ts`, shape of `ReplicaSetModel`; `abbr` = OCP badge, labels from OCP
  `public/models/index.ts`): Route (`route.openshift.io/v1`, `routes`, RT, namespaced), Ingress (`networking.k8s.io/v1`,
  `ingresses`, I), NetworkPolicy (`networking.k8s.io/v1`, `networkpolicies`, NP), PersistentVolumeClaim (`v1`,
  `persistentvolumeclaims`, PVC), PersistentVolume (`v1`, `persistentvolumes`, PV, **cluster-scoped**), StorageClass
  (`storage.k8s.io/v1`, `storageclasses`, SC, cluster-scoped), ProjectRequest (`project.openshift.io/v1`,
  `projectrequests`, cluster-scoped; **no descriptor, no nav** — create-only, used by T-0309 and the audit label map).
  Add all to `K8S_MODELS`. Check OCP abbrs by grepping `abbr:` next to each model name.
- **Types** (`shared/k8s/types.ts`): re-export `PersistentVolumeClaim`, `PersistentVolume` (core/v1), `Ingress`,
  `NetworkPolicy` (networking/v1), `StorageClass` (storage/v1) from `kubernetes-types`; hand-write `Route` (spec: host?,
  path?, subdomain?, to {kind,name,weight?}, alternateBackends?, port?.targetPort, tls? {termination,
  insecureEdgeTerminationPolicy?, certificate?, key?, caCertificate?, destinationCACertificate?}, wildcardPolicy?;
  status.ingress[]: host, routerName, routerCanonicalHostname?, wildcardPolicy?, conditions[] {type,status,reason?,
  message?,lastTransitionTime?}) and `ProjectRequest` (metadata.name, displayName?, description?), TSDoc pointing at
  OCP `RouteKind` (`public/module/k8s/types.ts`).
- **Nav (NAV-1):** `NavSectionId` += `'storage'`; `SECTIONS` = Home, Workloads, Networking, **Storage**, Administration
  (CP5b inserts Operators after Home and Compute after Storage — leave a one-line comment). Orders: Networking =
  Services 10 (existing), Routes 20, Ingresses 30, NetworkPolicies 40; Storage = PersistentVolumes 10,
  PersistentVolumeClaims 20, StorageClasses 30. Discovery already drops Routes on vanilla and empty sections (NAV-2).
- **Minimal descriptors** `registry/kinds/{routes,ingresses,networkpolicies,persistentvolumeclaims,persistentvolumes,storageclasses}.tsx`:
  `model`, `nav`, columns `nameColumn`, `namespaceColumn` (namespaced only), `ageColumn`; export `<Kind>Resource` type
  and descriptor; register in `registry.ts` after `serviceDescriptor` in nav order. TSDoc "filled in by T-03xx".
- **`ListActions` slot** (`registry/types.ts`): `ListActions?(props: { cluster: string }): ReactNode` — "buttons in
  the list heading (OCP `ListPage` `createButtonText`/`createProps`), e.g. Projects' Create Project (T-0309)". Same
  method-syntax shape as `HeadingAlert`. `ResourceListPage.tsx:ResourceList` passes it as `PageHeading actions`. One
  test in `list/ResourceListPage.test.tsx`-style with a fake descriptor is enough (put it in `nav/` or `list/` test
  file you already touch; no new descriptor uses it yet).
- **Mocks** — new file `mocks/k8s/networkingStorageFixtures.ts`, called from `seedClusterObjects` (only the call in
  `fixtures.ts`). Namespace `shop` unless noted; all certs/keys obviously fake (`FAKE-CERT`, `FAKE-KEY`).
  - StorageClasses: `standard-csi` (default annotation, `provisioner: csi.example.com`, `allowVolumeExpansion: true`,
    `volumeBindingMode: WaitForFirstConsumer`, 2 parameters), `slow-nfs` (`allowVolumeExpansion` absent).
  - PVs: `pv-db-data` (Bound → `shop/db-data`, csi `csi.example.com`, 10Gi, node affinity), `pv-uploads` (Bound →
    `shop/uploads`, `nfs: nfs.example.com:/exports/uploads`), `pv-spare` (Available), `pv-old` (Released).
  - PVCs: `db-data` (Bound, standard-csi, 10Gi, RWO, mounted by the `db-*` StatefulSet pods via `spec.volumes`),
    `uploads` (Bound, slow-nfs — Expand disabled), `scratch` (Pending, no volume), `resizing` (Bound, standard-csi,
    condition `FileSystemResizePending`).
  - Routes (**only where `servesProjects`**; add `route.openshift.io` to `apiServer.ts:OPENSHIFT_GROUPS`): `web`
    (host `web-shop.apps.<cluster>.example.com`, `tls.termination: edge`, insecure Redirect, fake cert/key set,
    Admitted True, to Service `web`), `web-canary` (path `/beta`, `alternateBackends` weight 20, Admitted True),
    `pending` (no `status.ingress`), `rejected` (Admitted False, reason `HostAlreadyClaimed`), `wildcard`
    (`wildcardPolicy: Subdomain`, host `*.wild.apps.<cluster>.example.com`).
  - Ingress `shop-ingress` (class `openshift-default`, 2 rules / 3 paths → Service `web`, TLS host list + secret
    `shop-tls`, load-balancer hostname) and Secret `shop-tls` (`kubernetes.io/tls`, fake data — SAFE5-4 tests use it).
  - NetworkPolicies: `deny-all-ingress` (podSelector `{}`, policyTypes [Ingress], no rules), `allow-web-from-router`
    (podSelector app=web, ingress from namespaceSelector + podSelector, ports 8080/TCP), `db-egress` (policyTypes
    [Egress], egress to ipBlock `10.0.0.0/16` except `10.0.5.0/24`, port 5432).
  - **PVC resize:** after a successful patch of a PVC's `spec.resources.requests.storage`, the mock sets
    `status.capacity.storage` to it (grow only) so the list/details update live — hook it where patches are applied
    (`apiServer.ts:patch`), one small helper, no general simulator.
  - **ProjectRequest:** `POST /apis/project.openshift.io/v1/projectrequests` creates Namespace + Project (annotations
    `openshift.io/display-name`, `openshift.io/description`, `openshift.io/requester` = mock user) and returns the
    Project (201); name clash → 409 AlreadyExists Status; RBAC per existing `rbac.ts` profile (RO → 403 Forbidden).
- **FRONTEND.md** (owner-approved text, frontend-architect 2026-11-25): folder tree line 50 → `networking/ storage/`
  live **inside** the engine as kind extras (ADR-0037 §1): replace `features/networking/  storage/  compute/  home/`
  with `resources/networking/ (routes/, ingresses/, networkpolicies/, services/)  resources/storage/ (pvcs/, pvs/,
  storageclasses/)  resources/projects/ (CP5a)`; registry section: add one sentence "CP5a: `ListActions` (list heading
  buttons); the Pods tab shows only when `podsSelector(obj)` returns a selector (T-0301)".

## Context pack
- Docs: FRONTEND.md § Folder structure, § The resource registry; ADR-0037 §1.
- Exemplars: T-0189 (same shape, `docs/tasks/T-0189-fe-cp4b-kinds-foundation.md` Contract); `shared/k8s/models.ts:ReplicaSetModel`
  (L76), `NamespaceModel` (cluster-scoped, L41); `registry/kinds/configmaps.tsx` (minimal descriptor);
  `mocks/k8s/workloadFixtures.ts` (fixture-file pattern), `mocks/k8s/fixtures.ts:seedClusterObjects` (L528).
- Touch points: `registry/types.ts:NavSectionId`, `HeadingAlert` (shape to copy); `nav/useClusterNav.ts:SECTIONS` (L23);
  `list/ResourceListPage.tsx:ResourceList` (L87-101); `mocks/k8s/apiServer.ts:OPENSHIFT_GROUPS` (L59), `create` (L308),
  `patch` (L361); `mocks/k8s/rbac.ts:isAllowed`; `registry/kinds/kinds.test.tsx` (registry uniqueness).
- OCP reference: `/home/bad/works/openshift-console/frontend/packages/console-app/console-extensions.json` L940–1000
  (section order), L1317–1400 (Storage items); `public/models/index.ts` (RouteModel, IngressModel, …).

## Acceptance criteria
- [ ] NAV-1: dev-1 sidebar sections Home, Workloads, Networking (Services, Routes, Ingresses, NetworkPolicies), Storage (PersistentVolumes, PersistentVolumeClaims, StorageClasses), Administration; on `prod-k8s-1` Routes is absent (`useClusterNav` tests).
- [ ] Each new kind's list renders its mock objects (`/k8s/ns/shop/<plural>`, `/k8s/cluster/<plural>` for PV/SC) and a details page opens (one parameterised test).
- [ ] Mock: POST projectrequests creates Project + Namespace (201) and 403s for RO; PVC request patch updates `status.capacity` (mock tests).
- [ ] `ListActions` renders in the list heading (test with a fake descriptor).
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
