# CP5 — Networking, storage, compute & cluster overview (spec)

**Author:** ocp-product-owner · **Date:** 2026-11-25 · **Checkpoint:** CP5 (split into CP5a / CP5b / CP5c) · **Branch:** `cp/5-networking-storage-compute`
**Binding inputs:** ROADMAP §CP5 (scope) and §CP3.7 item 3 (fleet perspective holds the fleet view), CP3.6 acceptance W5
(Storage / Compute nav sections are CP5 scope), CP3.7 spec Q4 (`/fleet/...` naming), CP4 spec §4a.7 SAFE and Q2 (no extra
production confirmations beyond OCP's), SECURITY.md §Authorization / §Token handling / §Proxy hardening / §Audit,
UX.md §2–§10, CLAUDE.md "UI north star".
**OCP references** (paths relative to `openshift-console/frontend` unless marked *(np)* = repo
`openshift/networking-console-plugin`, `src/views/...`, read with `gh api`; OCP `main` moved Services, Routes, Ingresses and
NetworkPolicies into that plugin):
- Nav: `packages/console-app/console-extensions.json` L940–1000 (sections Networking, Storage, Builds, Compute, User
  Management, Administration, in that order), L1017–1080 (Home: Overview, Projects, Search, API Explorer, Events),
  L1317–1400 (Storage: PersistentVolumes, PersistentVolumeClaims, StorageClasses, …), L1516–1634 (Compute: Nodes,
  Machines, MachineAutoscalers, MachineHealthChecks, separator, ControlPlaneMachineSets, MachineSets, …).
- Networking *(np)*: `services/list/ServiceList.tsx` + `services/list/hooks/useServiceColumn.tsx`; `routes/list/RoutesList.tsx`
  + `routes/list/hooks/useRouteColumns.ts` (Name, Backend health, Namespace, Status, Location, Service),
  `routes/details/RouteDetailsPage.tsx`; `ingresses/list/IngressesList.tsx`; `networkpolicies/list/NetworkPolicyList.tsx`.
  Our existing Services descriptor follows release-4.18 `service.jsx` (`web/src/features/resources/registry/kinds/services.tsx`).
- Storage: `public/components/persistent-volume-claim.tsx` L207–231 (Status, PersistentVolume, Capacity, Used, StorageClass),
  `persistent-volume.tsx` L120–147 (Status, Claim, Capacity, Labels, Created), `storage-class.tsx` L122–128 (Provisioner,
  Reclaim policy); PVC actions `packages/console-app/src/actions/hooks/usePVCActions.ts` (Expand PVC modal).
- Compute: `packages/console-app/src/components/nodes/NodesPage.tsx` (columns L173–327), `NodeDetailsPage.tsx` (tabs),
  `NodeDetails.tsx`, `NodeDetailsConditions.tsx`, `NodeRoles.tsx`, `NodeStatus.tsx`, `status/SchedulableStatus.tsx`,
  `menu-actions.tsx` L72–79 ("Mark as schedulable" / "Mark as unschedulable"), `modals/ConfigureUnschedulableModal.tsx`
  (copy "Unschedulable nodes won't accept new pods. …"), `NodeWorkload.tsx` (Pods); `public/components/machine-set.tsx`
  L288–316 (Machines, Instance type, CPU, Memory), `public/components/machine.tsx`.
- Cluster overview: `public/components/dashboard/dashboards-page/cluster-dashboard/cluster-dashboard.tsx` (main: Status +
  Utilization; left: Details + Inventory; right: Activity), `status-card.tsx` (health items, "Operators"),
  `details-card.tsx` (Cluster API address, Cluster ID, Infrastructure provider, OpenShift version, Update channel, "View
  settings"), `inventory-card.tsx` ("Cluster inventory"), `activity-card.tsx` ("View all events"),
  `packages/console-shared/src/components/dashboard/activity-card/ActivityBody.tsx` ("Ongoing", "There are no ongoing
  activities.", "Recent events", "Pause"/"Resume", "There are no recent events."),
  `packages/console-app/src/components/dashboards-page/OperatorStatus.tsx`, `ClusterUpdateActivity.tsx`.
- Cluster settings: `public/components/cluster-settings/cluster-settings.tsx` L1813–1825 (tabs Details, ClusterOperators,
  Configuration), `cluster-version.tsx`, `cluster-operator.tsx` L132–155 (Status, Version, Message), `cluster-status.tsx`.
- Operators (OLM v0): `packages/operator-lifecycle-manager/src/components/clusterserviceversion.tsx`,
  `useClusterServiceVersionColumns.ts` (Name, Namespace, Managed Namespaces, Status, Last updated, Provided APIs),
  `subscription.tsx` + `useSubscriptionColumns.ts` (Status, Update channel, Update approval).
- Projects: `public/components/namespace.tsx` (project list/details, Create Project modal).
- Fleet view: no OCP counterpart (fleet invention); style follows OCP list pages (UX.md §5) and ACM's "All Clusters" →
  Clusters list (status icon + text, version, nodes).

## 1. Problem and goal

CP4 gave operators the workload day-2 loop. The other half of the daily job still sends them to 40 separate consoles:
*is the route admitted and where does it point? is the PVC bound, can I expand it? which node is NotReady, cordon it;
is the cluster upgrading, which ClusterOperator is degraded, which operator CSV failed?* And there is still no answer to
the first question of every on-call shift: **"which of my clusters is unhealthy right now?"**

CP5 delivers (a) the Networking and Storage sections, (b) Compute, the cluster overview dashboard, Cluster Settings
(read) and Installed Operators (read), all with OCP's pages, copy and actions, and (c) the **fleet overview**: one page
with the health of every cluster the user may see, computed with the user's own grant tokens, tolerant of slow and
unreachable clusters.

**Split (recommended).** Each sub-checkpoint gets QA verify, PO acceptance and a tag (`cp-5a`, `cp-5b`, `cp-5c`) on
this branch; merge per sub (CP4 Q7 precedent).

| Sub | Theme | AC prefixes |
|---|---|---|
| **CP5a** | Networking + Storage + Projects: Services (complete), Routes (link-out), Ingresses, NetworkPolicies; PVCs (+ Expand PVC), PVs, StorageClasses; Create Project; Storage nav section (W5) | NAV, SVC, RT, ING, NP, PVC, PV, SC, PRJ, SAFE5, QG5A |
| **CP5b** | Compute + cluster health: Nodes (Mark as (un)schedulable, Pods = drain view, conditions, capacity/allocatable), MachineSets + Machines (read), Cluster Settings (ClusterVersion, ClusterOperators, read), cluster Overview dashboard, Installed Operators (CSV + Subscription, read) | NODE, MS, CS, OVW, OLM, QG5B |
| **CP5c** | Fleet overview: status of all granted clusters on one page in the Fleet perspective, opened to every user; backend aggregation | FLT, FBE, QG5C |

CP5c depends on the health rules of CP5b (OVW-3/FLT-4 share them); its backend (FBE) may start in parallel with CP5a.

## 2. Personas

- **Priya, on-call SRE (read-write on most clusters):** starts every shift on the fleet overview, jumps to the one red
  cluster, finds the NotReady node and cordons it, checks which ClusterOperator is degraded.
- **Marco, platform engineer:** checks route admission and TLS, expands a full PVC, reviews NetworkPolicies when an app
  can't reach its database, creates Projects for teams, watches a cluster upgrade progress.
- **Ines, auditor / read-only user:** reads every page on every cluster; all mutations disabled with the reason; sees
  the fleet overview for the clusters she is granted, nothing more.
- **Alice, read-only on production (`prod-k8s-1`, `prod-eu-1`), read-write on staging:** the Kubernetes cluster
  `prod-k8s-1` must degrade gracefully (no Routes, no ClusterVersion, no OLM).

## 3. User stories

1. As Marco I want Routes with a clickable Location and admission status so that I can open the app and see why a route isn't served.
2. As Marco I want Ingresses and NetworkPolicies with their rules readable on the details page so that I can debug connectivity without reading YAML.
3. As Marco I want PVCs with status, bound PV, capacity and storage class, and an Expand PVC action, so that I can fix a full volume in one step.
4. As Priya I want a Nodes list with Ready/NotReady and "Scheduling disabled", conditions, allocatable and the node's pods so that I can triage a sick node and see what runs on it before maintenance.
5. As Priya I want Mark as unschedulable / schedulable with a confirmation naming the cluster so that I cordon the right node on the right cluster.
6. As Priya I want a cluster Overview with version, update status, degraded ClusterOperators, node counts and recent events so that I understand a cluster's health in one screen.
7. As Marco I want Cluster Settings with the ClusterVersion, update history and ClusterOperators list so that I can follow an upgrade.
8. As Marco I want Installed Operators with their CSV status and Subscription (channel, approval) so that I can spot a failed operator install or a pending manual approval.
9. As Priya I want one fleet page listing every cluster I can access with health, version, operators and nodes so that I know where to look first without opening 40 consoles.
10. As Ines I want the fleet page to show only my granted clusters and to say "No access" / "Unreachable" per row instead of failing so that partial outages don't hide the rest.
11. As anyone I want every CP5 mutation's confirmation and toast to name the cluster so that I never act on the wrong one.

## 4. Acceptance criteria

Conventions as CP4 §4: "RW"/"RO", "Access check" (`useResourceAccess`/`useActionAccess` SSAR path), "Mutation guard"
(proxy MutationGuard). Exact type, endpoint and component names are the architects' call unless quoted. All copy quoted
below is OCP's unless marked *(fleet)*. "Hidden by discovery" = the descriptor declares its API group and the nav item /
tab / card disappears when the cluster doesn't serve it (CP3.7 rule; e.g. Routes, ClusterVersion, OLM on `prod-k8s-1`).
Every new kind gets the generic list/details/YAML/Events pages, label-chip → Search links, Search selectability and the
common actions (Edit labels / annotations / `<Kind>` / Delete `<Kind>`) unless an AC says otherwise. Cluster-scoped kinds
have no project bar.

---

## CP5a — Networking, Storage, Projects

### 5a.1 Navigation (NAV)
- **NAV-1** The cluster sidebar gains the OCP sections in OCP order: Home, (Operators — CP5b), Workloads, Networking, Storage, (Compute — CP5b), Administration (`console-extensions.json` L940–1000). Items inside each section follow OCP order: Networking = Services, Routes, Ingresses, NetworkPolicies; Storage = PersistentVolumes, PersistentVolumeClaims, StorageClasses. Closes CP3.6 W5 for Storage.
- **NAV-2** Sections with no item the cluster serves are dropped (existing rule); kinds the user's SA may not list still show (the list page then shows the RBAC error, UX.md §10), as OCP does.

### 5a.2 Services (SVC)
- **SVC-1** Existing list/details keep their columns (release-4.18 parity); details gain the OCP tabs Details, YAML, Pods (pods by `spec.selector`, via the existing `podsSelector`), Events. A selector-less Service shows no Pods tab.
- **SVC-2** Details gain a "Routes" item listing Routes in the namespace whose `spec.to`/`alternateBackends` name this Service (one namespaced Route list, no per-route requests); hidden by discovery on Kubernetes.

### 5a.3 Routes (RT)
- **RT-1** List columns *(np)* `useRouteColumns.ts`: Name, Namespace, Status, Location, Service (Backend health only if it needs no extra API — otherwise omitted and noted in the parity row). Status = Accepted / Rejected / Pending from `status.ingress[].conditions[type=Admitted]` with OCP icons (UX.md §5).
- **RT-2** **Location link-out:** `http(s)://<spec.host><spec.path>` (https when `spec.tls` is set) as an external link (`target="_blank"`, `rel="noopener noreferrer"`, external-link icon). The URL is built only from `spec.host`/`spec.path`; a host that isn't a valid DNS name renders as text, never as a link (unit test incl. `javascript:` and `//evil` inputs). Wildcard / not-yet-admitted routes show the host as text.
- **RT-3** Details *(np)* `RouteDetailsPage.tsx`: Details (left: metadata; right: Location, Status, Host, Path, Service link + weight, Target port, Router canonical hostname per ingress), TLS settings section (Termination type, Insecure traffic; certificates/keys **never** rendered — "Certificate"/"Key" rows only say whether they are set), Router: Ingress status table (Host, Router name, Conditions); tabs Details, YAML, Events. Hidden by discovery.
- **RT-4** Actions: common actions only (Edit Route → YAML; the Route form is out of scope).

### 5a.4 Ingresses (ING)
- **ING-1** List *(np)* `IngressesList.tsx`: Name, Namespace, Labels, Host (first host, "+N" if more), Created.
- **ING-2** Details: Details + a "Rules" section table (Host, Path, Path type, Service, Service port) and a "TLS" section (Hosts, Secret name linking to the Secret); Ingress-class and load-balancer address rows. Hosts in rules are link-outs under RT-2's rules.

### 5a.5 NetworkPolicies (NP)
- **NP-1** List *(np)* `NetworkPolicyList.tsx`: Name, Namespace, Pod selector (link to Search with the selector, existing `PodSelectorLink`), Created.
- **NP-2** Details: Details (Pod selector, Policy types) + "Ingress rules" and "Egress rules" sections, one row per peer: Target pods / From (pod selector, namespace selector, IP block with exceptions), Ports (`port/protocol`). Empty selector reads "All pods" / "All namespaces"; a policy without ingress rules but with `Ingress` in policyTypes reads "All incoming traffic is denied" *(np copy; verify exact wording at task time)*.
- **NP-3** No NetworkPolicy form, no MultiNetworkPolicy (out of scope).

### 5a.6 PersistentVolumeClaims (PVC)
- **PVC-1** List (`persistent-volume-claim.tsx` L207–231): Name, Namespace, Status (Bound / Pending / Lost with OCP icons), PersistentVolume (link), Capacity (`status.capacity.storage`, else requested), StorageClass (link), Created. "Used" is omitted (Prometheus, Q6). Filter by Status.
- **PVC-2** Details: right column Status, Requested capacity, Capacity, Access modes, Volume mode, StorageClass, PersistentVolume; Conditions section (e.g. `FileSystemResizePending`); tabs Details, YAML, Events. A "Pods" item lists pods in the namespace that mount the claim (one namespaced pod list).
- **PVC-3** **Expand PVC** action (OCP `usePVCActions.ts`): RW only; disabled with reason when the StorageClass has `allowVolumeExpansion` ≠ true or the claim isn't Bound. Modal "Expand PersistentVolumeClaim" with a size input (number + Mi/Gi/Ti unit) prefilled with the current request; validation rejects a size ≤ current (copy from OCP). Patches `spec.resources.requests.storage`; success toast names claim + cluster; cluster error shown inline in the modal.

### 5a.7 PersistentVolumes and StorageClasses (PV, SC)
- **PV-1** PVs are cluster-scoped; list (`persistent-volume.tsx` L120–147): Name, Status (Available / Bound / Released / Failed), Claim (namespace/name link), Capacity, Labels, Created. Details: Reclaim policy, Access modes, Volume mode, StorageClass, Claim, Node affinity (text), source type (e.g. `csi: <driver>`, `nfs: <server>:<path>`).
- **SC-1** StorageClasses cluster-scoped; list (`storage-class.tsx`): Name (with a "Default" label when annotated `storageclass.kubernetes.io/is-default-class=true`), Provisioner, Reclaim policy, Created. Details: Provisioner, Reclaim policy, Volume binding mode, Allow volume expansion, Parameters (key/value list). No create form, no "Set as default" (backlog).

### 5a.8 Projects (PRJ)
- **PRJ-1** Existing Projects list/details stay; details tabs per OCP minus Prometheus: Details, YAML, Workloads → omitted (backlog), RoleBindings → omitted (CP6+). Parity row records the gap.
- **PRJ-2** **Create Project** button in the Projects heading (OCP `CreateProjectModal`): Name (DNS-1123 validated), Display name, Description; POST `ProjectRequest` through the proxy with the grant token; on success navigate to the new project's details and toast with the cluster name. Disabled with reason for RO or when the SSAR for `create projectrequests` is denied. Hidden on clusters without `project.openshift.io` (Kubernetes: no "Create Namespace" in CP5; CP5.5).

### 5a.9 Safety and security (SAFE5) — applies to CP5a and CP5b
- **SAFE5-1** Every CP5 mutating modal (Expand PVC, Create Project, Mark as unschedulable, Delete `<Kind>`) shows the cluster display name and environment label (CP4 SAFE-1 pattern, `ResourceMutationModal`). No additional production-only confirmation (CP4 Q2). Delete of a Node / PV / StorageClass / Project keeps the existing name-typing rule only where OCP asks for it (Project, Namespace).
- **SAFE5-2** RO users see every CP5 action disabled with the UI-9 reason (never hidden); the Mutation guard blocks them server-side — Api tests for PATCH on `nodes` and `persistentvolumeclaims` and POST `projectrequests` for RO → 403 ProblemDetails, nothing forwarded.
- **SAFE5-3** Upstream `Authorization` for CP5 mutations is the grant token (Api test per verb, CP4 SAFE-2 harness).
- **SAFE5-4** Route TLS keys/certificates and Secret data referenced by Ingress TLS are never rendered on details pages, in toasts or in logs.
- **SAFE5-5** Audit labels for the new mutations ("Expanded PersistentVolumeClaim", "Created Project", "Marked Node unschedulable" / "schedulable") via the shared label map.

### 5a.10 Quality gates (QG5A)
- **QG5A-1** `scripts/check-be.sh`, `scripts/check-fe.sh` green; unit tests for RT-2 URL building, PVC-3 size validation, NP-2 rule rendering.
- **QG5A-2** Playwright: Route Location opens a new tab URL (asserted, not followed); RW expands a PVC (fake apiserver); RO sees Expand PVC / Create Project disabled; `prod-k8s-1` shows no Routes nav item.
- **QG5A-3** `docs/architecture/ocp-parity.md` rows for every new list/details page + Expand PVC + Create Project modals, all `match` (or an accepted, recorded gap) at accept.

### 5a.11 Design / lanes (frontend-architect, 2026-11-25)
No new ADR: kind code lives in the engine per ADR-0037 §1 (`features/resources/{networking,storage,projects}/`); the
descriptor `ListActions` slot is a registry extension documented in FRONTEND.md (T-0300).

| Order | Tasks | Paths (disjoint per lane) |
|---|---|---|
| First (alone) | T-0300 foundation: models, types, registry stubs, Storage nav section, `ListActions`, mock fixtures, FRONTEND.md | `shared/k8s`, `mocks/k8s`, `registry.ts`, `registry/types.ts`, `registry/kinds/<new kinds>`, `nav/`, `list/` |
| Lane N (networking) | T-0301 Services Pods tab + Routes item → T-0302 Routes list + link-out → T-0303 Route details → T-0304 Ingresses → T-0305 NetworkPolicies | `networking/`, `registry/kinds/{services,routes,ingresses,networkpolicies}.tsx`, `details/ResourcePodsTab.tsx` |
| Lane S (storage + projects) | T-0306 SC + PV → T-0307 PVCs + `parseQuantity` → T-0308 Expand PVC → T-0309 Create Project | `storage/`, `projects/`, `registry/kinds/{storageclasses,persistentvolumes,persistentvolumeclaims,projects,namespaces}.tsx`, `shared/k8s/quantity.ts`, `admin/audit/auditActionLabels.ts` |
| Last | T-0310 UX probe/side-by-side → T-0311 QA e2e + parity | docs, `web/e2e/` |

Design deviations (to record as parity gaps in T-0311): Route Backend health column and metrics tab omitted; Route
TLS cert/key shown as "Set/Not set" (SAFE5-4); Service Pods tab shows an empty state for selector-less Services
instead of all pods; PVC Used column + donut omitted (Q6); Expand PVC adds a StorageClass `allowVolumeExpansion`
disabled reason (PVC-3, not in OCP); no Events tab on Project/Namespace details (as OCP); audit labels keep the T-0220
map's imperative tense ("Create Project") rather than SAFE5-5's past tense.

Backend asks: Api tests for SAFE5-2/3 (RO PATCH `persistentvolumeclaims` / POST `projectrequests` → 403, grant token
upstream); an audit hint (e.g. JSON-Patch path) if "Patch PersistentVolumeClaim" should read "Expand PVC"; no proxy
allow-list change expected (structural `ProxyPath`).

---

## CP5b — Compute, cluster health, Operators

### 5b.1 Nodes (NODE)
- **NODE-1** Compute section (OCP order): Nodes, Machines, MachineSets (others not in CP5). Closes CP3.6 W5 for Compute. Nodes are cluster-scoped.
- **NODE-2** List (`NodesPage.tsx`): Name, Status, Roles, Instance type, Zone, Architecture, Created; low-priority columns per UX.md §5. Memory / CPU / Filesystem / Pods columns are omitted (Prometheus or an all-pods list; Q6). Status = Ready / Not Ready / Unknown from the `Ready` condition (OCP `NodeStatus.tsx`), with a second line "Scheduling disabled" when `spec.unschedulable` (OCP `SchedulableStatus.tsx`). Filters: Status, Roles.
- **NODE-3** Details tabs: Details, YAML, Pods, Events (release-4.18 set; `main`'s Overview / Configuration / Health need Prometheus/Machine APIs — recorded deviation, Q6). Details: left metadata + Taints, Provider ID, Machine (link, OpenShift); right Status, Roles, Addresses (`NodeIPList.tsx` types), Operating system / OS image, Architecture, Kernel version, Kubelet version, Container runtime, Boot time. Sections: "Conditions" (existing `ConditionsTable`: Type, Status, Reason, Updated, Changed, Message — OCP `NodeDetailsConditions.tsx`) and a "Capacity and allocatable" table *(fleet arrangement of OCP data)*: rows CPU, Memory (humanised binary units), Ephemeral storage, Pods; columns Capacity, Allocatable.
- **NODE-4** **Pods tab = drain view:** all pods with `spec.nodeName=<node>` (one list with `fieldSelector`, all namespaces), columns Name, Namespace, Status, Ready, Owner, Created; a filter "Exclude DaemonSet pods" *(fleet)* and a count line "N pods (M not managed by a DaemonSet)" *(fleet)* so the operator sees what a drain would evict. Bare pods (no owner) carry a warning icon with tooltip "Not managed by a controller — deleted on drain" *(fleet)*. No eviction action in CP5 (Q2).
- **NODE-5** Actions (`menu-actions.tsx`): "Mark as unschedulable" opens OCP's modal (title, body copy from `ConfigureUnschedulableModal.tsx`, primary "Mark unschedulable") + cluster per SAFE5-1; "Mark as schedulable" patches immediately (OCP: no modal) with a toast naming node + cluster. Exactly one of the two is shown based on `spec.unschedulable`. Both gated on `patch nodes` (Access check) and RO per SAFE5-2. Plus common actions (Edit labels / annotations / Node, Delete Node — OCP parity).
- **NODE-6** No Node terminal / debug pod, no Node logs (out of scope; backlog).

### 5b.2 MachineSets and Machines (MS) — read-only
- **MS-1** MachineSets (`machine-set.tsx`, namespace `openshift-machine-api` preselected by the project bar link from the nav, as OCP): Name, Namespace, Machines ("R of D machines", links to Machines filtered by the set's selector), Instance type, CPU, Memory (from `machine.openshift.io/vCPU` / `memoryMb` annotations). Details: Desired / Current / Ready / Available counts, Selector, Instance type, Region, Zone; tabs Details, YAML, Machines, Events.
- **MS-2** Machines (`machine.tsx`): Name, Namespace, Phase, Provider state, Node (link), Region, Zone, Created; details with Node link and Addresses. Node details' Machine link lands here.
- **MS-3** No "Edit Machine count", no MachineAutoscaler / MachineHealthCheck / ControlPlaneMachineSet pages (Q7). Common Edit/Delete actions are **not** offered on MachineSets/Machines in CP5 (read-only per ROADMAP); YAML tab is read-only for these kinds.
- **MS-4** Hidden by discovery (`machine.openshift.io`), e.g. on clusters without Machine API (HyperShift guests, Kubernetes).

### 5b.3 Cluster Settings (CS) — read-only
- **CS-1** Administration → "Cluster Settings" at `/c/<cluster>/settings/cluster` with tabs Details and ClusterOperators (Configuration omitted, backlog). Hidden by discovery (`config.openshift.io`).
- **CS-2** Details (`cluster-version.tsx`, `cluster-status.tsx`): Current version, Update status (Up to date / Available updates / Updating to `<version>` with progress from the `Progressing` message / Failing with message), Channel, Cluster ID, a list of available versions (read), and an "Update history" table (Version, State, Started, Completed). No "Update" / "Select a version" / channel edit button (Q9).
- **CS-3** ClusterOperators tab (`cluster-operator.tsx`): Name, Status (Available / Progressing / Degraded / Cannot update / Unknown, OCP derivation and icons), Version, Message. Default sort puts non-Available first *(fleet; OCP sorts by name — confirm at task time, else parity wins)*. ClusterOperator details: Details (Status, Version, Message, Conditions table), YAML, Related objects (links where we have a descriptor, text otherwise).

### 5b.4 Cluster overview dashboard (OVW)
- **OVW-1** `/c/<cluster>/overview` (today a placeholder) renders OCP's dashboard grid (`cluster-dashboard.tsx`): left column Details + Cluster inventory cards, main column Status card, right column Activity card. The Utilization card is omitted (Q6). Home → Overview stays the first Home item.
- **OVW-2** Details card (`details-card.tsx`): Cluster API address, Cluster ID, Infrastructure provider (`infrastructures/cluster`), OpenShift version, Update channel, link "View settings" → CS-1; "Not available" per row when the read is forbidden or missing. On Kubernetes clusters: Kubernetes version (`/version`) instead of OpenShift version, Cluster ID / channel rows hidden *(fleet)*; FleetConsole's cluster display name, environment and distribution are shown as the first rows *(fleet)*.
- **OVW-3** Status card: health items "Cluster" (from ClusterVersion `Available`/`Failing`/`Progressing`) and "Operators" (OCP `OperatorStatus.tsx`: worst ClusterOperator state + popover listing degraded / unavailable / progressing operators linking to them, plus a count of CSVs in `Failed` when OLM is served). Control plane and alert items are omitted (Prometheus, Q6). An update-available `Alert` "A cluster version update is available" links to Cluster Settings (no Update action). **The derivation rules (health = worst of …) are written once and shared with FLT-4.**
- **OVW-4** Cluster inventory card (`inventory-card.tsx`): Nodes (total, with Not Ready count linking to Nodes filtered), Pods (total with Failed / Pending counts), StorageClasses, PersistentVolumeClaims (with Pending count). Each count is one list request (no per-object requests); counts > list limit use the list's `remainingItemCount` or show "N+" *(architect: decide; never paginate all pods only to count)*.
- **OVW-5** Activity card (`activity-card.tsx`, `ActivityBody.tsx`): "Ongoing" (cluster update in progress, OCP `ClusterUpdateActivity`; "There are no ongoing activities.") and "Recent events" streamed (reuse the CP2/CP3.6 event stream) with Pause/Resume, warnings marked with the warning icon (OCP), "View all events" → Events page, "There are no recent events." when empty (Q5).
- **OVW-6** Each card loads and fails independently (card-level skeleton; card-level inline error naming the forbidden/failed read); one forbidden resource never blanks the page.

### 5b.5 Installed Operators (OLM) — read-only
- **OLM-1** New "Operators" nav section after Home (OCP order) with "Installed Operators" (`clusterserviceversions`); hidden by discovery (`operators.coreos.com`). Namespaced with the project bar; "All projects" excludes copied CSVs with a server-side `labelSelector=!olm.copiedFrom` (OCP behaviour; prevents N-namespace × M-operator lists).
- **OLM-2** List (`useClusterServiceVersionColumns.ts`): Name (spec.displayName + version, provider underneath; icon from `spec.icon` base64 data URI only — never a remote URL), Namespace, Managed Namespaces ("All Namespaces" or the list), Status (`status.phase` + reason; Succeeded green, Failed red, Installing / Pending / Replacing in-progress icons), Last updated, Provided APIs (owned CRD display names, max 4 then "View N more…").
- **OLM-3** CSV details: tabs Details, YAML, Subscription, Events. Details: Provider, Created at, Links, Maintainers, Description (rendered markdown, sanitised — no raw HTML), Provided APIs, Conditions table. Operand (custom resource) tabs are out of scope.
- **OLM-4** Subscription tab (`subscription.tsx`): the Subscription in the CSV's namespace whose `status.installedCSV` matches; shows Update channel, Update approval (Automatic / Manual), Installed version, Starting version, Catalog source, Install plan (status, and "Upgrade available" / "Requires approval" text when an InstallPlan awaits manual approval). No approve / change channel / uninstall actions (read-only; backlog). Missing Subscription → "No Subscription found" empty state.
- **OLM-5** No OperatorHub, no Uninstall, no Edit/Delete on CSVs and Subscriptions in CP5 (common mutating actions suppressed for these kinds); YAML read-only.

### 5b.6 Quality gates (QG5B)
- **QG5B-1** Gates green; Api tests for NODE-5 (PATCH `spec.unschedulable` RW → forwarded with grant token, RO → 403); FE tests for node status derivation, OVW-3 shared health rules (table-driven over ClusterVersion/ClusterOperator fixtures), OLM-1 selector.
- **QG5B-2** Playwright: RW marks a node unschedulable (modal names cluster) and schedulable again; Overview renders all four cards against the fake apiserver and degrades on `prod-k8s-1` (no ClusterVersion / Operators items, Kubernetes version shown); Installed Operators list hides copied CSVs.
- **QG5B-3** Parity rows: Nodes list/details, Mark as unschedulable modal, Cluster Settings, ClusterOperators, Overview dashboard, Installed Operators list/details, Subscription tab — `match` or recorded accepted gap.

### 5b.7 Design / lanes (frontend-architect, 2026-11-25)
No new ADR: kind code lives in the engine per ADR-0037 §1 (`features/resources/{compute,cluster-settings,overview,operators}/`);
the Overview page moves from `features/home` into `features/resources/overview/` (deleted feature). Registry
extensions documented in FRONTEND.md by T-0331: `readOnly` (MS-3/OLM-5), tabs `machines`/`subscription`/
`related-objects` via `KindTabs`, `allNamespacesLabelSelector` (OLM-1), `StaticNavItem.requires` (discovery).
FLT-4/OVW-3 rules live once in `web/src/shared/health/` (pure, typed by the generated Fleet schemas; raw objects
normalized to the same facts) and land first.

| Order | Tasks | Paths (disjoint per lane) |
|---|---|---|
| First (alone) | T-0330 models, types, `k8sListPage`, Fleet aliases, `shared/health` → T-0331 registry extensions, Operators/Compute nav, Overview + Cluster Settings nav items, minimal descriptors, MSW fixtures, FRONTEND.md | `shared/k8s`, `shared/api/types.ts`, `shared/health`; then engine files, `nav/`, `registry/kinds/*` stubs, `mocks/k8s` |
| Lane C (compute) | T-0332 Nodes list + details → T-0333 Node Pods tab (drain view) + Mark as (un)schedulable → T-0334 MachineSets + Machines | `compute/`, `registry/kinds/{nodes,machines,machinesets}`, `mocks/k8s/computeFixtures.ts` |
| Lane O (cluster + operators) | T-0335 Cluster Settings + ClusterOperators → T-0336 Overview dashboard (moves `features/home`) → T-0337 Installed Operators | `cluster-settings/`, `overview/`, `operators/`, `registry/kinds/{clusteroperators,clusterserviceversions}`, `resources/routes.tsx`, `app/router.tsx` (T-0336), `mocks/k8s/clusterFixtures.ts` |
| Last | T-0338 UX probe/side-by-side → T-0339 QA e2e + parity | docs, `web/e2e/` |

Decisions: OVW-4 counts are one bounded page each (`limit` 500): exact via `remainingItemCount`, else "`<n>`+" when
only `continue` comes back (selector-filtered lists) — never paginate to count; Pods Failed/Pending via
`fieldSelector=status.phase=`. ClusterOperators default sort = Name (CS-3: parity wins over the fleet tweak), Status
sortable by severity. CSV description via `react-markdown` (new dependency, raw HTML skipped, no innerHTML); CSV icons
only from `data:` URIs. Node cordon = JSON Patch on `/spec/unschedulable` (ADR-0037 §4). Mock scenarios mirror the
fleet MSW table (5c.5).

Design deviations / gaps (record in T-0338/T-0339): Node Memory/CPU/Filesystem/Pods columns, Overview/Configuration/
Health tabs, terminal/logs (Q6, NODE-6); no drain/evict (Q2); Utilization card, Control plane/Alerts items (Q6);
MachineSet Edit count, autoscaler pages (Q7); Cluster Settings Configuration tab and update/channel buttons (Q9);
OperatorHub, operand tabs, CSV/Subscription Edit/Delete/Uninstall (OLM-5). Fleet additions: Capacity and allocatable
table, drain-view filter/count/bare-pod warning, Overview Kubernetes/FleetConsole rows.

Backend asks: none (proxy only; NODE-5 Api tests done in T-0324).

---

## CP5c — Fleet overview

### 5c.1 Fleet perspective for everyone (FLT)
- **FLT-1** Every signed-in user gets the "Fleet management" entry in the cluster switcher (today admins only, UX.md §2). Fleet pages show a new first sidebar section **"Fleet"** with item **"Overview"** *(fleet)*; "Fleet administration" stays admin-only (non-admins never see the section; direct URLs keep the existing ADM-3 behaviour). `/fleet` redirects to `/fleet/overview` for everyone (today → `/fleet/admin/users`; update the router test).
- **FLT-2** `/fleet/overview` page heading "Fleet overview" *(fleet)*. A list page per UX.md §5 (`ConsoleDataView`, compact, sortable, filters, pagination), one row per cluster the user can access through their **effective grants** (direct or group, CP4.5 rules) — the same set the switcher shows. Columns: Name (cluster type icon + display name linking to `/c/<cluster>/overview`, name underneath), Environment (label), Access ("Read only" label when effective RO), Status, Version, Update, Operators, Nodes, Last checked.
- **FLT-3** Cell rules: Version = OpenShift version (ClusterVersion `status.desired.version`) or Kubernetes `gitVersion`; Update = "Up to date" / "Update available" / "Updating to `<v>`" / "Failing" (OpenShift only, "—" on Kubernetes); Operators = "All available" or "`<n>` degraded, `<m>` unavailable" linking to the cluster's ClusterOperators tab ("—" on Kubernetes); Nodes = "`<ready>` of `<total>` Ready" with Not Ready count highlighted, "`<n>` unschedulable" second line when > 0, linking to Nodes; Last checked = OCP `Timestamp`.
- **FLT-4** Status (icon + text, UX.md §5 mapping) per cluster, worst wins: **Unreachable** (network/TLS/timeout), **Token invalid** (401 — credential expired/revoked), **Degraded** (ClusterVersion Failing, any ClusterOperator Degraded or not Available, or any Node Not Ready), **Updating** (Progressing), **Healthy**; plus **Restricted** when the SA may not read one of the probed resources (that cell shows "Restricted" with a tooltip naming the resource; other cells still render). Rules shared with OVW-3.
- **FLT-5** Default sort: Status severity (Unreachable, Token invalid, Degraded, Updating, Restricted, Healthy), then display name. Filters: Name (text), Status (multi), Environment, Type (OCP/K8s). A summary line above the table *(fleet)*: "`<n>` clusters · `<d>` degraded · `<u>` unreachable · `<p>` updating", each a filter link.
- **FLT-6** Rows appear as their status arrives (a slow cluster never delays the others; pending rows show a per-row spinner "Checking…" *(fleet)*). Auto-refresh every 60 s while the page is visible (paused in background tabs) plus a "Refresh" button; Last checked reflects the cache time (FBE-4).
- **FLT-7** Empty states: no grants → "No clusters" / "You don't have access to any cluster. Ask a FleetConsole administrator for access." *(fleet)*; filters to nothing → UX.md §5 "Clear all filters".
- **FLT-8** Selecting a row's name switches cluster exactly like the switcher (recent clusters updated). No bulk actions, no mutations on this page.

### 5c.2 Backend requirements (FBE) — design is the architects'
- **FBE-1** A fleet-status capability returning, for the calling user, one entry per effectively-granted cluster with the FLT-3/FLT-4 data or a typed per-cluster error (unreachable, timeout, unauthorized, forbidden-per-probe). Partial failure is the normal case: the response/stream succeeds with error rows.
- **FBE-2** Probes run **with the user's effective grant token for that cluster** (never FleetConsole's own SA, never another user's token), through the same outbound client, TLS/CA settings and proxy policies as the resource proxy. Grants resolved once per request (CP4.5 cache), no N+1 to the database per cluster.
- **FBE-3** Bounded: per-request cluster concurrency limit (configurable, default ≤ 10), per-cluster timeout (configurable, default 5 s), probes per cluster minimal (OpenShift: ClusterVersion `version`, ClusterOperators list, Nodes list — metadata + conditions only where possible; Kubernetes: `/version` + Nodes), cancelled when the client disconnects. A global limit on concurrent fleet-status computations protects the pod from 50 users opening the page at once.
- **FBE-4** Results cached briefly (default 30 s) via the existing `IQueryCache`; the cache key must include the credential/grant used so RO/RW or group changes never leak data across users; revoke / grant-change invalidation reuses the CP4.5 tags. Responses carry the time each entry was computed.
- **FBE-5** Delivery lets the SPA render rows progressively (FLT-6) — e.g. per-cluster endpoint with client fan-out, or one streamed response; architects choose and record it in an ADR if it adds a new public API shape (CLAUDE.md rule 7).
- **FBE-6** Not persisted; no background polling in CP5 (Q4). No token, raw upstream body or upstream error text containing credentials in responses, logs or traces (token-leak sweep extended); upstream error messages are mapped to the FBE-1 categories. Structured log + metric per probe outcome (latency, category); no audit entry per read.
- **FBE-7** Authorization: any authenticated, active user; deactivated users get 401/403 as everywhere else. A cluster disabled by an admin is excluded.

### 5c.3 Quality gates (QG5C)
- **QG5C-1** Gates green. Api tests: only granted clusters returned (direct, group, none); RO user's row computed with the RO credential; timeout and unreachable cluster yield error rows while others succeed; concurrency limit honoured (test double counting in-flight); cache isolation between two users with different grants on one cluster; token-leak sweep over the fleet endpoint.
- **QG5C-2** Playwright: non-admin user opens Fleet management → Fleet overview, sees only granted clusters, one mock cluster unreachable shows "Unreachable" while the rest render; clicking a row lands on that cluster's Overview; admin still sees Fleet administration.
- **QG5C-3** Parity row (fleet invention, style check against UX.md §5 list rules) + ux-designer visual review incl. dark theme and the K8s navy masthead on the fleet page (must stay neutral — fleet pages keep the OpenShift masthead).
- **QG5C-4** Performance smoke: 40 mock clusters (5 slow at 4 s, 2 unreachable) → first rows < 1 s, complete < 6 s, ≤ the configured concurrency upstream at any time (QA measures, k6 or test double).

### 5c.4 Backend design (backend-architect, 2026-11-25)
- Decision: ADR-0041 (one NDJSON stream `GET /api/fleet/status`, probes with the user's winning grant token through the
  proxy pool + policy chain, Table reads, cache per (cluster, credential) 30 s, per-request concurrency 10, per-cluster
  timeout 5 s, pod-wide limiter → 503 `Fleet.Busy`). Contract: `docs/specs/CP5-api-contract.md`. Health rules (FLT-4)
  live once in the frontend, shared with OVW-3; the backend returns facts.
- CP5a/CP5b need no new endpoints (pure proxy); their mutation safety is proven by T-0324.
- Tasks: T-0320 probe core (port, options, cached probe, DTOs, metric) · T-0321 query/stream (bounded, isolated) ·
  T-0322 Infrastructure reader (Tables, 4 MiB cap, classifier) · T-0323 endpoint + limiter + OpenAPI/gen:api + docs ·
  T-0324 CP5 proxy mutation-verb rows · T-0325 QA (QG5C-1, QG5C-4).
- Waves (max 2 BE agents): W1 T-0320 ‖ T-0324 → W2 T-0321 ‖ T-0322 → W3 T-0323 → W4 T-0325. CP5a FE runs in parallel
  throughout; the FE fleet page can start from the contract with MSW and switches to generated types after T-0323.

### 5c.5 Frontend design (frontend-architect, 2026-11-25)
No new ADR (consumes ADR-0041's contract). New feature `web/src/features/fleet/` (route module, `api/` data layer,
page). The Fleet perspective opens to every signed-in user (Q3): switcher "Fleet management" for all, sidebar section
"Fleet" > "Overview" first, "Fleet administration" admin-only; `/fleet` → `/fleet/overview` (Q10, router test updated).

| Order | Tasks | Paths |
|---|---|---|
| W1 (parallel with T-0330) | T-0340 shell: route + redirect, Fleet nav, sidebar, switcher gating, placeholder page | `features/fleet` (shell), `app/router.tsx`, `app/layout/{navigation,AppSidebar}`, `cluster-context/{switcherRows,ClusterSwitcher}`, `shared/routing` |
| W2 (parallel with T-0331) | T-0341 data: `useFleetStatus` (`streamedQuery`, append refetch, key `['api','fleet','status']`, 60 s visible-only refresh), `useFleetRows` (pending/drop rules §2.2), MSW NDJSON handler + scenarios, e2e fake Tables | `features/fleet/api`, `mocks/handlers/fleet.ts`, `mocks/fixtures/fleetStatus.ts`, `web/e2e/support/fakeClusterHealth.ts` |
| W3 | T-0342 page: table, cells from `shared/health`, severity sort, filters, summary links, refresh, empty/error states, row switch → `/c/<name>/overview` | `features/fleet` (rest) |
| Last | T-0343 UX review (+ UX.md §2) → T-0344 QA Playwright (QG5C-2) | docs, `web/e2e/` |

Suggested overall waves (≤ 2 FE engineers): T-0330 ‖ T-0340 → T-0331 ‖ T-0341 → T-0332 ‖ T-0342 → T-0333 ‖ T-0335
→ T-0334 ‖ T-0336 → T-0337 → UX/QA per sub-checkpoint. If CP5c is accepted before T-0336, QG5C-2's row click lands
on the existing Overview placeholder (acceptable; the route does not change).

Notes: MSW scenarios — `prod-eu-1` healthy + updates, `prod-us-1` Restricted (ClusterOperators forbidden),
`prod-k8s-1` Kubernetes, `staging-eu-1` Updating, `dev-2` Degraded, `lab-1` Unreachable (timeout, slow), `dev-1`
healthy; `Fleet.Busy` 503 renders an inline Alert with "Try again" keeping the last rows. The Fleet overview is a
fleet invention: parity = UX.md §5 list rules (QG5C-3).

---

## 5. UX notes

- **Layouts:** list/details pages per UX.md §5/§6; cluster-scoped kinds without project bar. Details right-column fields as OCP; rule tables (Ingress rules, NetworkPolicy rules, Route ingress status, Capacity and allocatable, Update history) are PF `Table variant="compact"` under a `SectionHeading`.
- **Overview grid:** OCP `DashboardGrid` proportions (left 25 %, main 50 %, right 25 % at ≥ lg; stacked below), PF `Card`s with `CardTitle` per OCP copy; health items as OCP `HealthItem` (icon + title + subtitle, popover on Operators).
- **Link-outs:** PF external-link icon after the text (OCP `ExternalLink`), opens a new tab.
- **Modals:** Mark as unschedulable / Expand PVC / Create Project = PF `Modal variant="small"`, OCP titles and button copy, body starts with the object "on **`<cluster display name>`**" + environment label (CP4 pattern).
- **Read-only kinds** (MachineSets, Machines, ClusterOperators, ClusterVersion, CSVs, Subscriptions): kebab shows no mutating items; YAML tab read-only with OCP's read-only notice.
- **Fleet overview:** looks like an OCP list page (heading, toolbar filters, compact table); status icon + text only, no coloured row backgrounds; production rows carry the environment label, not a band (the band is per-cluster pages only). The Fleet perspective's masthead stays OpenShift-neutral.
- **Errors:** per-card / per-row / per-cell, never full-page for partial failures; RBAC errors quote the cluster's message (UX.md §10).

## 6. Out of scope (CP5)

Node drain / eviction (Q2); Node terminal, Node logs; MachineSet scaling, MachineAutoscalers, MachineHealthChecks,
ControlPlaneMachineSets, MachineConfigs / MachineConfigPools; cluster update actions and channel edit (Q9); Cluster
Settings → Configuration tab; Prometheus-based data: Utilization card, alerts, control-plane health, node CPU/memory/
filesystem, PVC "Used" (Q6); OperatorHub, operator install/uninstall/approve, operand pages; Route / Ingress /
NetworkPolicy / StorageClass create forms; MultiNetworkPolicies, UDNs, NADs; VolumeSnapshots, VolumeSnapshotClasses,
VolumeAttributesClasses; PVC clone/snapshot; "Set as default" StorageClass; Project Workloads / RoleBindings tabs;
Create Namespace on Kubernetes (CP5.5); fleet background polling, history, notifications; fleet-wide search; link-out
to each cluster's own console (existing backlog item).

## 7. Open questions (with recommendation)

| # | Question | Recommendation |
|---|---|---|
| Q1 | Split CP5 into a/b/c with tags `cp-5a/b/c`? | **Yes**, as §1; merge per sub. CP5c's backend may start in parallel with CP5a. |
| Q2 | ROADMAP says "drain view": add a Drain action? OCP has none. | **No eviction action in CP5.** "Drain view" = the node's Pods tab with the DaemonSet / bare-pod hints (NODE-4); cordon (NODE-5) covers the first maintenance step. A PDB-aware Drain with progress goes to backlog. |
| Q3 | Open the Fleet perspective to non-admins? | **Yes** (FLT-1): fleet overview for everyone, scoped to effective grants; Fleet administration stays admin-only. CP3.7 deferred exactly this to CP5. |
| Q4 | Fleet status on demand with the user's tokens, or a background poller with FleetConsole's own SA? | **On demand + 30 s cache, user's grant tokens** (FBE-2/4). A poller needs a privileged FleetConsole SA per cluster — a security-model change (ADR) — and shows users data their grants may not cover. Backlog: scheduled health + history. |
| Q5 | ROADMAP says "recent warning events"; OCP's Activity card shows all events with warnings marked. | **OCP parity** (OVW-5): muscle memory, and the Events page already filters by type. Warning counts per cluster on the fleet page are not worth an events list ×40 clusters. |
| Q6 | No Prometheus integration exists: Utilization card, alerts, node CPU/memory, PVC Used, Node Overview/Health tabs? | **Omit**, record each as an accepted parity gap; backlog "Prometheus/Thanos query proxy" (needs a security review of PromQL through the proxy). |
| Q7 | MachineSets: offer "Edit Machine count"? | **No**, read-only per ROADMAP (scaling machines costs money and needs Machine API RBAC most grants lack); backlog. |
| Q8 | Ship Expand PVC and Create Project (mutations) in CP5a? | **Yes**: both are frequent day-2 actions, small, and reuse `ResourceMutationModal` + SAFE patterns. |
| Q9 | Cluster update ("Update" / channel change) from Cluster Settings? | **No** — read-only; upgrades of production clusters through a multi-cluster proxy need change-window design (existing backlog). |
| Q10 | Fleet page route and naming? | **`/fleet/overview`, section "Fleet", item "Overview", heading "Fleet overview"**: avoids a second "Clusters" next to admin's Clusters (CP3.7 Q4 reserved `/fleet/clusters` only to avoid that collision). |

## 8. ROADMAP backlog additions (appended to ROADMAP §Backlog by the PO, 2026-11-25)

- (CP5 spec) Node drain: evict pods with PDB awareness, progress per pod, cluster-named confirmation (OCP has none; fleet invention).
- (CP5 spec) Prometheus/Thanos query proxy → Utilization card, alerts, node CPU/memory/filesystem, PVC Used, Node Overview/Health tabs.
- (CP5 spec) MachineSet "Edit Machine count"; MachineAutoscalers, MachineHealthChecks, MachineConfigPools pages.
- (CP5 spec) Fleet health history: scheduled status checks, last-change timestamps, notifications on cluster degradation.
- (CP5 spec) Operator actions: approve InstallPlan, change channel, uninstall; OperatorHub read.
- (CP5 spec) Create forms: Route, Ingress, NetworkPolicy, StorageClass; "Set as default" StorageClass; VolumeSnapshots.
- (CP5 spec) Project details Workloads and RoleBindings tabs.
