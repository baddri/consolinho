# CP5.5 — Kubernetes clusters (spec)

Product owner, 2026-11-25. Scope: ROADMAP §"CP5.5 — Kubernetes clusters" plus the CP3.7 ACCEPT item
(`docs/specs/CP3.7-acceptance.md` L33) and five human-requested UI fixes (§4.3). Builds on CP3.7 DIST-1..8 and NST-1..6.

## 1. Problem and goal

CP3.7 gave clusters a declared distribution and made the sidebar, overview and project selector discovery-driven, but
we have only ever exercised a "Kubernetes" cluster through mocks and the fake e2e API. Real vanilla clusters break in
three ways an operator notices on day one:

1. **Namespaced service accounts can't list namespaces.** On OpenShift a Project list is filtered per user and always
   works; on Kubernetes a `team-a`-only SA gets 403 on `GET /api/v1/namespaces`, so the selector is empty and the user is
   stuck on "All namespaces" lists that 403 too. The admin already saved the namespaces they care about on the credential
   (CP3.7 NST-5); the selector should fall back to them.
2. **Nothing proves the sidebar, overview, proxy (watch, logs, exec) and copy are right on a real Kubernetes API.** We
   need a local kind cluster on podman for dev and an opt-in e2e suite against it.
3. **The connection test still reads like OpenShift** on Kubernetes: "OpenShift version: Unknown" and a denied
   "List cluster operators" check.

Goal: an admin registers a kind/vanilla cluster, tests a namespaced token, grants it, and the user lands in a working
namespace with an OCP-shaped sidebar that only shows what the cluster serves. Split:

- **CP5.5a** — backend (accessible-cluster namespaces, connection-test checks), kind dev environment, connection-test UI,
  plus the five UI fixes (§4.3, independent FE lane). Tag `cp-5.5a`.
- **CP5.5b** — Kubernetes UI: namespace fallback, discovery sidebar verification, Create Namespace, kind e2e. Tag `cp-5.5b`.

## 2. Personas

- **Kenji, platform engineer:** runs a handful of vanilla Kubernetes clusters next to the OpenShift fleet; registers them
  with a cluster-wide `view` SA and expects the same console minus OpenShift-only pages.
- **Alice, application developer:** read-write in `team-a` on `dev-k8s-1` through a namespaced SA that cannot list
  namespaces; wants to open the console and see her pods, not a 403.
- **Ola, FleetConsole admin:** onboards clusters; reads the connection test to decide which grants to give.
- **Dev/QA (us):** need a real Kubernetes API on the laptop (podman, no docker) to build and test against.

## 3. User stories

- US-1 As Alice I want the namespace selector to offer the namespaces my admin configured when my token can't list
  namespaces, so that I can reach my workloads without knowing URLs.
- US-2 As Kenji I want the sidebar on a Kubernetes cluster to show only the pages that cluster serves, in OCP order, so
  that I don't click into "not served" pages.
- US-3 As Kenji I want to create a Namespace from the Namespaces list on Kubernetes, as I create Projects on OpenShift.
- US-4 As Ola I want the connection test of a Kubernetes cluster to show only Kubernetes facts and checks, so that a
  green result doesn't look half-failed.
- US-5 As a developer I want one script that starts a seeded kind cluster on podman with ready-to-paste tokens, so that I
  can test Kubernetes behaviour locally and in e2e.

## 4. Acceptance criteria

## CP5.5a — Backend, kind environment, connection test

### 5.5a.1 Accessible-cluster namespaces (NSA) — API change, §4.4
- **NSA-1** `GET /api/clusters` returns, per cluster, `fallbackNamespaces: string[]`: the inspect namespaces saved on the
  credential behind the user's **effective** grant (CP4.5 precedence), in saved order; `[]` when none. Never derived
  from the cluster.
- **NSA-2** Given Ola edits a credential's inspect namespaces (or runs a test that saves them), When Alice reloads, Then her
  accessible-clusters response reflects the change (invalidated via the existing credential tags of the access cache,
  ADR-0040; no new TTL path). Test covers it.
- **NSA-3** The field is exposed only for clusters the caller has a grant on (same filter as today); admins get no extra
  data through this endpoint. OpenAPI regenerated; SPA types updated by `gen:api`.

### 5.5a.2 Connection test on Kubernetes (CT) — CP3.7 ACCEPT item
- **CT-1** Capability checks declare their API group (they already do); a check whose group is not served by the cluster
  (from the discovery the test already reads, DIST-7) is **omitted** from `capabilities.checks`. On kind,
  "List cluster operators" is absent; on OpenShift the list is unchanged. Headline rules (ADR-0011) are unaffected.
- **CT-2** When `detectedDistribution` is Kubernetes, the result view (stored-credential and unsaved-token dialogs) hides
  the "OpenShift version" fact and the `openShiftVersion` step row. "Kubernetes version" stays. Driven by the
  **detected** type: a cluster declared Kubernetes that serves OpenShift APIs still shows them, plus the DIST-7 warning.
- **CT-3** The stored summary (LastTestLabel, credential details) never shows an OpenShift-only item for a Kubernetes
  cluster. Tests: application (CT-1 both distributions), SPA (CT-2 both detected types + mismatch).

### 5.5a.3 Local kind cluster (KIND)
- **KIND-1** `scripts/kind-dev.sh up|down|status|tokens` manages a kind cluster `fleetconsole-dev` on **podman**
  (`KIND_EXPERIMENTAL_PROVIDER=podman`), pinned node image, idempotent (`up` twice is a no-op). Needs only `kind` and
  podman on the host (kubectl runs inside the control-plane container).
- **KIND-2** `up` seeds: namespaces `team-a`, `team-b`; in `team-a` a Deployment (2 replicas), a StatefulSet with a PVC
  (kind's `standard` StorageClass), a CronJob, a Service + Ingress, a ConfigMap, a Secret and a CrashLoopBackOff pod;
  a few Warning events result naturally. ServiceAccounts: `fleet-viewer` (cluster `view` + `list namespaces`) and
  `team-a-editor` (`edit` in `team-a` only; **cannot** list namespaces).
- **KIND-3** `tokens` prints the API URL, the CA bundle (PEM) and short-lived tokens (`kubectl create token --duration`)
  for both SAs to stdout only; nothing is written into the repo.
- **KIND-4** README (or `docs/dev/TROUBLESHOOTING.md`) documents: installing kind, rootless podman prerequisites
  (cgroup v2 delegation), registering the cluster in FleetConsole (Distribution Kubernetes, TLS "CA bundle", inspect
  namespaces `team-a` for `team-a-editor`).
- **KIND-5** Proxy smoke against kind (manual, QA, recorded in the task): list + watch, follow logs, exec terminal
  (WebSocket), scale a Deployment — all through FleetConsole with `team-a-editor`. Any failure is a blocker bug.

### 5.5a.4 Quality gates (QG55A)
- **QG55A-1** `scripts/check-be.sh` and `scripts/check-fe.sh` green; NSA-1..3 and CT-1 covered by application/API tests.
- **QG55A-2** A recorded kind discovery fixture (`/api`, `/apis`) is checked in for FE unit tests (used by DSC-2).

## CP5.5b — Kubernetes UI

### 5.5b.1 Namespace selector fallback (NSF)
- **NSF-1** Given listing Projects/Namespaces returns 403 on the active cluster, When the selector opens, Then it lists the
  cluster's `fallbackNamespaces` instead of an error, with helper text "You can't list namespaces on this cluster. Showing
  the namespaces configured for your access." Applies on any distribution (discovery- and response-driven, DIST-5).
- **NSF-2** In fallback mode "All namespaces" is not offered, and the selector's filter box offers "Go to namespace
  "<typed>"" when the typed text is a valid DNS-1123 label not in the list (the user may know a namespace the admin
  didn't list).
- **NSF-3** Landing (`/c/:cluster`) and the namespaced redirect (`k8s/<plural>`) choose, in fallback mode: the last
  namespace if the user has one for this cluster, else the first fallback namespace — never `all-namespaces`.
- **NSF-4** Given fallback mode and no fallback namespaces, the landing shows an empty state "No namespaces available":
  "Your access to this cluster can't list namespaces and none are configured for it. Enter a namespace name, or ask a
  FleetConsole administrator to add one." with the NSF-2 entry. No error toast.
- **NSF-5** Lists that 403 in a chosen namespace keep today's forbidden state (no fallback magic beyond the selector).

### 5.5b.2 Discovery-driven sidebar and pages on Kubernetes (DSC)
- **DSC-1** On the kind cluster the sidebar is exactly: Home (Overview, Search, Events), Workloads (OCP order, without
  DeploymentConfigs), Networking (Services, Ingresses, NetworkPolicies), Storage (PersistentVolumes,
  PersistentVolumeClaims, StorageClasses), Compute (Nodes), Administration (Namespaces). No Operators section, no
  Projects, Routes, DeploymentConfigs, MachineSets, Machines, Cluster Settings.
- **DSC-2** A table-driven unit test over **every** registry descriptor and static nav item asserts that each one whose
  group is not in the kind fixture (QG55A-2) is hidden, and each core/apps/batch/networking.k8s.io/storage.k8s.io kind is
  shown. Adding a new OpenShift-only kind without gating fails this test.
- **DSC-3** Direct URLs to unserved pages on kind (`…/k8s/ns/team-a/routes`, `…/settings/cluster`, `…/k8s/cluster/projects`)
  show the existing "not served" state, never a crash or a blank page.
- **DSC-4** Cross-links to OpenShift kinds are absent on kind: Service details has no Routes section, Search's kind picker
  lists served kinds only, Overview shows the Kubernetes version and no ClusterVersion/ClusterOperators/OLM rows, Fleet
  overview's row for kind shows `gitVersion` and node-based health without "Restricted" or error cells.
- **DSC-5** No per-cluster screen on kind contains the word "OpenShift" or "Project" (DIST-6), asserted by the kind e2e
  over the pages it visits.

### 5.5b.3 Create Namespace (NSC)
- **NSC-1** Where `project.openshift.io` is not served, the Namespaces list has a "Create Namespace" heading button
  (OCP `namespace.tsx` `CreateNamespaceModal`): Name (required, focused, DNS-1123 validated) and Labels (key=value
  chips). On success, navigate to the new namespace's details. Default network policy is out of scope.
- **NSC-2** The button is hidden for read-only access and disabled with the SAFE reason when the token is denied
  (`SelfSubjectAccessReview` create namespaces, as Create Project in CP5a). Mutation guard and audit as for any create.

### 5.5b.4 Quality gates (QG55B)
- **QG55B-1** Gates green; SPA tests cover NSF-1..4 (403 + list, 403 + empty, OpenShift unaffected), DSC-2, NSC-1/2.
- **QG55B-2** MSW: mock cluster `dev-k8s-ns` (Kubernetes, namespace list 403, `fallbackNamespaces: ["team-a"]`) so the
  fallback is reviewable without kind.
- **QG55B-3** `web/e2e/kubernetes.e2e.ts` runs only when `E2E_KIND=1` (skipped with a reason otherwise); its setup
  registers the kind cluster with both credentials and covers DSC-1, DSC-5, NSF-1/3 (as `team-a-editor`), CT-2, pod logs
  and exec on a kind pod. The fake-API smoke stays unchanged.
- **QG55B-4** ux-designer review of the selector fallback and Create Namespace modal against OCP (light theme; navy
  masthead already reviewed in CP3.7).

### 4.3 Also in this checkpoint (human-requested UI fixes, filed by the frontend architect; run in the CP5.5a FE lane)
- **T-0370** List load performance: namespaced vs all-namespaces lists load fast (no needless all-namespaces fetches).
- **T-0371** Cluster switcher menu: not cut off, more than one recent, badges don't wrap, wider menu, sticky header.
- **T-0372** Branding: product text and a more abstract logo.
- **T-0373** Preload the Monaco YAML editor so the YAML tab opens without a delay.
- **T-0374** Dashed underline only on field-help terms, not on table links.
Each is accepted by its own task's criteria; they don't change any criterion above.

### 4.4 API contract change (CP5.5a)
`AccessibleCluster` (response of `GET /api/clusters`) gains one required field:

| Field | Type | Meaning |
|---|---|---|
| `fallbackNamespaces` | `string[]` | Inspect namespaces of the credential behind the caller's effective grant (NSA-1); `[]` if none. Used by the namespace selector only when listing namespaces is forbidden. |

No other endpoint changes. Connection-test schema unchanged (CT-1 only shortens `capabilities.checks`; update its
description).

## 5. UX notes

- Fallback selector: same PF `Menu`/`MenuSearch` as today; helper text as a `MenuFooter`/`HelperText` line (subtle);
  the "Go to namespace" item is the first item while typing (OCP's project dropdown "create"/"type to filter" pattern).
- Create Namespace: PF `Modal` variant small, title "Create Namespace", primary "Create", secondary "Cancel" — copy as OCP.
  Error from the API shown inline as an `Alert` danger in the modal.
- Connection test on Kubernetes: the facts list simply has no OpenShift row (no "N/A"); checks list is shorter.
- The navy Kubernetes masthead and `K8s` tag (CP3.7) are unchanged.

## 6. Out of scope (CP5.5)

- New Kubernetes-only kinds (IngressClass, EndpointSlice, CRD browser) — backlog (Q2).
- kind as an AppHost resource (Q3); other distributions' auth flavours (EKS IAM, AKS AAD, OIDC exec plugins).
- Default network policy in Create Namespace; namespace quotas/limit ranges forms.
- Auto-discovering a namespaced SA's namespaces (e.g. probing `SelfSubjectRulesReview`).
- Changing the declared distribution from the detected one (CP3.7 Q3 stands).

## 7. Open questions (with recommendation)

| # | Question | Recommendation |
|---|---|---|
| Q1 | Fallback source: the credential's saved inspect namespaces, or a separate per-grant namespace list? | **Saved inspect namespaces** (ROADMAP, CP3.7 NST-5): no new admin field; admins already enter them when testing. A per-grant list goes to backlog if needed. |
| Q2 | Add Kubernetes-only kinds now? Ingress, NetworkPolicy, Namespaces already exist. | **No new kinds**: the registry already covers vanilla day-2 needs; OCP doesn't nav IngressClass/EndpointSlice either. Backlog. |
| Q3 | kind inside `aspire run` or a separate script? | **Separate script** (KIND-1): kind is heavy (~1.5 GB RAM, laptop OOM risk, MEMORY note) and not needed for most work; e2e opts in via `E2E_KIND=1`. |
| Q4 | Allow typing an unlisted namespace in fallback mode (NSF-2)? | **Yes**: the token decides access anyway; the list is a convenience, and a stale admin list must not lock users out. |
| Q5 | Create Namespace in this checkpoint? | **Yes, minimal** (Name + Labels): parity with Create Project (CP5a Q8); without it Kubernetes users leave for kubectl. |
| Q6 | Name of the new field? | **`fallbackNamespaces`**: says when it is used; avoids implying it is the user's full namespace list. |

## 8. Backlog candidates (to append to ROADMAP §Backlog on acceptance)

- (CP5.5 spec) Kubernetes-only kinds: IngressClasses, EndpointSlices, CustomResourceDefinitions browser.
- (CP5.5 spec) Per-grant namespace list for the selector fallback, independent of the credential's inspect namespaces.
- (CP5.5 spec) kind cluster as an optional AppHost resource; CI job running `kubernetes.e2e.ts`.
- (CP5.5 spec) Create Namespace: default network policy option (OCP parity).
