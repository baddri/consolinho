---
id: T-0300
title: CP5a foundation — models, Storage nav section, minimal descriptors, ListActions slot, mock fixtures
status: done
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
- [x] NAV-1: dev-1 sidebar sections Home, Workloads, Networking (Services, Routes, Ingresses, NetworkPolicies), Storage (PersistentVolumes, PersistentVolumeClaims, StorageClasses), Administration; on `prod-k8s-1` Routes is absent (`useClusterNav` tests).
- [x] Each new kind's list renders its mock objects (`/k8s/ns/shop/<plural>`, `/k8s/cluster/<plural>` for PV/SC) and a details page opens (one parameterised test).
- [x] Mock: POST projectrequests creates Project + Namespace (201) and 403s for RO; PVC request patch updates `status.capacity` (mock tests).
- [x] `ListActions` renders in the list heading (test with a fake descriptor).
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-25 frontend-engineer: started; 7 models + Route/ProjectRequest types, Storage nav section, 6 minimal
  descriptors, `ListActions` slot, `networkingStorageFixtures.ts` (+ db pods mount `db-data`), ProjectRequest create
  and PVC resize settle in `apiServer.ts`, FRONTEND.md lines. Tests: nav NAV-1/2 + per-kind list/details + ListActions
  (`useClusterNav.test.tsx`), mock tests (`mocks/k8s.test.ts`). Ready for review.

## Review
- 2026-11-25 frontend-architect, round 1: **APPROVE**. `scripts/check-fe.sh` green (1316 tests). Models/abbrs, types,
  NAV-1 order, minimal descriptors, `ListActions` slot, mocks (ProjectRequest 201/409/403, PVC grow-only settle,
  fake certs) match the contract. `AppShell.test.tsx` edit outside paths accepted (direct consequence of NAV-1).
- Nit (optional) `mocks/k8s/networkingStorageFixtures.ts` — `resizing` PVC's `volumeName` names an unseeded PV; T-0304
  (PVC details, PV link) should either seed `pvc-resizing-0f9e` or accept a 404 link — decide there.
- Nit (optional) `nav/useClusterNav.test.tsx:145` — test mutates the real storageclasses descriptor (restored via
  `onTestFinished`); fine for now, switch to the projects descriptor's real `ListActions` test once T-0309 lands.
- 2026-11-25 ux-designer (visual, nav scope only): **APPROVE**. Measured with a Playwright text dump of the mock nav at
  1280 (dev-1 OCP, prod-k8s-1 vanilla); OCP ref console not running, so parity is from source.
  - Sections Home, Workloads, Networking, Storage, Administration: Storage right after Networking, as OCP
    `packages/console-app/console-extensions.json:948-967` (networking → storage → builds; builds/compute come later in CP5b).
  - Networking order Services, Routes, Ingresses, NetworkPolicies matches networking-console-plugin `plugin-manifest.ts`
    extension order (no insertAfter); the labels match each `src/views/*/manifest.ts` name. Routes are hidden on vanilla prod-k8s-1 (NAV-2).
  - Storage order PersistentVolumes, PersistentVolumeClaims, StorageClasses with OCP labels (`console-extensions.json:1318-1348`,
    insertAfter chain). Cluster-scoped kinds link to `/k8s/cluster/...`. The active item gets `aria-current` (StorageClasses*, Routes*).
  - List headings use the kind plural ("StorageClasses", "PersistentVolumeClaims"). Column content is left to T-0310.

## Handover notes
- Lane tasks fill `registry/kinds/<plural>.tsx` only; TSDoc in each names the owning task (T-0302…T-0307).
- `ProjectRequestModel` is in `K8S_MODELS` (abbr `''`, as OCP); `apiServer.ts` routes its POST to `projectRequest()`
  (Namespace + Project, requester = credential's SA subject, 409 on a taken namespace, 403 via `rbac.ts` for view).
- PVC resize: `settlePvcResize()` (networkingStorageFixtures.ts) runs on every successful JSON Patch; grows only, Bound only.
- `resizing` PVC points at `pvc-resizing-0f9e`, a PV that doesn't exist (only the 4 spec'd PVs are seeded).
- Route fixtures are seeded last (OpenShift only) so other uids don't depend on distribution; `route.openshift.io`
  joined `OPENSHIFT_GROUPS`. Vanilla discovery now lists `networking.k8s.io` and `storage.k8s.io` (test updated).
- `ListActions` test mutates the real storageclasses descriptor and restores it (`useClusterNav.test.tsx`).
- Also touched `app/layout/AppShell.test.tsx` (section list gains Storage). A one-off `window is not defined`
  unhandled error from `pods.test.tsx` appeared in one full run, not in the rerun (teardown flake).
- Style probe not run: only nav items + Name/Namespace/Created lists change; the CP5a probe is T-0310.
