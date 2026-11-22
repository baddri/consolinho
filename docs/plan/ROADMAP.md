# Roadmap — checkpoints

Each checkpoint ends with something demonstrable. The orchestrator runs one checkpoint autonomously, then stops for
the human. Status: `planned` → `in_progress` → `done`.

| CP | Name | Status |
|---|---|---|
| 0 | Foundations | done (tag cp-0) |
| 1 | Identity & administration | done (tag cp-1) |
| 2 | Proxy, cluster switcher & generic resource browser (MVP) | done |
| 3 | Deploy to OpenShift | done (tag cp-3) |
| 3.5 | OCP look & feel | done (tag cp-3.5) |
| 3.6 | OCP parity (mirror the console) | done (tag cp-3.6) |
| 3.7 | Fleet foundations | planned (next) |
| 4 | Workloads day-2 operations | planned |
| 4.5 | Access at scale (groups + cache) | planned |
| 5 | Networking, storage, compute & cluster overview | planned |
| 5.5 | Kubernetes clusters | planned |
| 6 | Hardening, observability & polish | planned |

---

## CP0 — Foundations
**Goal:** the skeleton every later task builds on, with the architecture rules already enforced.
**Exit criteria:**
- `FleetConsole.slnx` with Domain/Application/Infrastructure/Api/AppHost/ServiceDefaults + 3 test projects; central package management; warnings as errors.
- In-house CQRS dispatcher + Logging/Validation/UnitOfWork behaviors, Result/Error types, ProblemDetails mapping — unit tested.
- EF Core `ConsoleDbContext` on Postgres with an initial (empty-ish) migration; Testcontainers integration test boots the Api.
- Architecture tests enforce layer dependencies.
- `aspire run` starts Postgres (podman), Api, and the Vite dev server; Api health endpoints green.
- `web/`: Vite + React + TS + PatternFly 6 app shell (masthead with placeholder cluster switcher, sidebar, routing), ESLint (boundaries, no-any), Prettier, Vitest + RTL + MSW, `gen:api` script wired to the Api OpenAPI document.
- Root `README.md` with dev setup (podman notes).

## CP1 — Identity & administration
**Fixed requirement from the human (2026-11-18): login uses OpenShift OAuth of the host cluster** — see ADR-0007; the
CP1 spec must include it. For development, use the in-repo OCP OAuth emulator `FleetConsole.DevOAuth` (wired in AppHost).

Login via OCP OAuth (authorize → callback → users/~ → FleetConsole cookie session), logout, `/api/auth/me`,
auto-provisioning (configurable), bootstrap admins/admin groups from config, CSRF header, roles, session revalidation.
Admin CRUD for **users** (pre-create, promote/demote admin, deactivate, global read-only flag, last login, OCP groups seen), **clusters** (register, edit, enable/disable, env tag, CA bundle),
**credentials** (add/rotate/delete SA token per cluster, write-only, fingerprint, JWT expiry), **grants** (user ↔ cluster
↔ credential, ReadOnly/ReadWrite), "test connection" (calls `/version` + SelfSubjectRulesReview with the token),
audit log of admin actions. Admin UI pages for all of it.

## CP2 — Proxy, cluster switcher & generic resource browser (MVP)
`/api/clusters/{cluster}/k8s/**` proxy with YARP, header hardening, MutationGuard + Audit policies, per-cluster TLS
pools, fake-apiserver integration tests. Frontend: real cluster switcher (search, env colour, recent), namespace/project
selector, k8s data layer with watch, resource registry, generic list/details/YAML(view+edit)/events pages for a first set
of kinds (Namespaces/Projects, Pods, Deployments, Services, ConfigMaps, Events), `useCanI`. Read-only users see
disabled actions with explanations.

## CP3 — Deploy to OpenShift
Containerfile (multi-stage: node build → dotnet publish → ubi/chiseled runtime), kustomize base + overlay, Route,
Secrets for bootstrap admin + DP cert, DB migration job, health probes, resource limits, NetworkPolicy, deployment
runbook in `docs/ops/`.

## CP3.5 — OCP look & feel (before CP4) — DONE (tag cp-3.5)
Make the UI look like the OpenShift console, and fit for production. Run by the new `ux-designer` agent: it audits
every screen (light + dark) against the OCP console (`openshift/console` source), writes `docs/architecture/UX.md` and
task files, and does a visual review of each FE task. Human asks (2026-11-21): (1) everything as close to the OCP
console as possible; (2) move the cluster switcher from the masthead to the top of the sidebar, where OCP has its
perspective switcher; (3) admin area polish. Known issues: the grant wizard shows two close buttons and a second
panel behind it (Modal `onClose` + `WizardHeader` close, modal wider than the wizard); user details show internal
copy ("enforced by the proxy from CP2", "Admin via configuration (user list)") and badly styled tabs; the register
cluster form is full width.

## CP3.6 — OCP parity: mirror the console (before CP4) — DONE (tag cp-3.6)
Human directive (2026-11-22): the UI must look and feel exactly like the OCP console ("feels like home"), in our own
code, before we build more features. Reference = local clone `/home/bad/works/openshift-console` (CLAUDE.md "UI north
star", UX.md §0). Run by the `ux-designer`, which also writes the spec, so this checkpoint skips the PO SPEC step:
1. Write `docs/architecture/ocp-parity.md`: one row per screen (shell: masthead, sidebar/nav, switcher; list, details,
   YAML, events tabs; forms, modals, empty/error states; admin pages) with our route, OCP route, OCP source path, and
   status `match` / `gap: …`. Fold in T-0118.
2. Get reference screenshots of the real console where possible (see HANDOVER "Needs human").
3. Turn the gaps into FE tasks by area, then BUILD with the usual architect + ux reviews.
Done when every row is `match` (or the human explicitly waives the row) and the PO accepts.

## CP3.7 — Fleet foundations (before CP4) — DONE (tag cp-3.7)
Human directive (2026-11-23). Shell and data changes that every CP4/CP5 page builds on, so they land first:
1. Switcher: display name as the main text (name underneath); cluster-type icon + text tag `OCP`/`K8s` (no
   OpenShift/Kubernetes logos); "Read only" only in the menu items, not on the toggle (keep it in the toggle's aria-label).
2. `Cluster.Distribution` (OpenShift | Kubernetes): domain, migration, admin API + form, switcher.
   Type = presentation only; **capabilities come from API discovery** (registry descriptors declare the API group they
   need; nav items and kinds hide when the cluster doesn't serve it). No hard-coded "OpenShift" copy on per-cluster screens.
3. Fleet perspective: a "Fleet management" entry in the cluster switcher (like ACM's "All Clusters") opens `/fleet/...`
   with its own sidebar holding Fleet administration (later the CP5 fleet view).
4. Kubernetes theme: on Kubernetes clusters only the masthead (and nav header) turn dark navy with a Kubernetes-blue accent;
   content area unchanged; colour is never the only cue (the tag from 1). ux-designer sets the values and checks contrast
   (light + dark).
5. Token test over several namespaces (bounded, parallel, results per namespace); the namespace list is saved on the
   credential and reused (also the future namespace-picker fallback for Kubernetes SAs that can't list namespaces).
6. ADRs: cluster type vs API discovery; Fleet perspective; groups and grant priority (CP4.5); access cache (CP4.5).

## CP4 — Workloads day-2 operations
Pods (logs with follow/container select/download, exec terminal via WebSocket, delete, events), Deployments/DC
(scale, rollout restart, pause/resume, revision history), StatefulSets, DaemonSets, ReplicaSets, Jobs, CronJobs
(trigger now, suspend), ConfigMaps/Secrets (reveal with confirm, edit), HPA. Search across kinds by label.
(CP3.6 ACCEPT) Cluster OpenAPI definitions via the proxy, feeding the YAML schema sidebar and the details field-help popovers (T-0133); Deployment ring scale buttons.
(CP3.7 ACCEPT, `docs/specs/CP3.7-acceptance.md`) First task: mock `prod-k8s-1` (Kubernetes, production, read-only for alice). F1: switcher
menu item must not truncate the display name to one letter when 3 labels show. F2: ux-designer checks the production band
under the navy masthead (light + dark). FE: drop `NamespaceRulesResult` alias + `testResultBody` cast after gen:api (T-0154).

## CP5 — Networking, storage, compute & cluster overview
Services, Routes (with link-out), Ingresses, NetworkPolicies; PVCs, PVs, StorageClasses; Nodes (cordon/drain view,
conditions, allocatable), MachineSets (read), Projects; cluster overview dashboard (ClusterVersion, ClusterOperators
health, node status, recent warning events); Operators (CSV/Subscription read-only); fleet view: status of all clusters
on one page.

## CP4.5 — Access at scale
- Groups (decided 2026-11-23): a grant's subject is a user **or** a host-OpenShift group name (string; membership =
  `User.Groups` recorded at login, refreshed with session revalidation). FleetConsole-local groups optional later.
  Precedence: a direct user grant beats group grants; among group grants the highest admin-set priority wins (ties refused
  at save; read-only wins if one slips through); the user's read-only flag always applies. No `system:*` groups. Admin group
  picker lists host `Group` objects via FleetConsole's SA (read-only role). "Effective access" admin view (user × cluster:
  which grant wins and why).
- Access cache: FusionCache behind `HybridCache` — memory L1 + Redis L2 + Redis backplane; tags per user/cluster/credential/
  group, invalidated from the existing domain events after commit; short TTL backstop; **fail-safe off** for authorization;
  the decrypted token never leaves L1 (Redis holds the encrypted one). Redis in the AppHost and the OpenShift manifests.

## CP5.5 — Kubernetes clusters
Onboard plain Kubernetes clusters on the CP3.7 prep: namespaces vs Projects (namespace picker fallback from the credential's
saved namespaces), per-distribution sidebar from discovery, Kubernetes-only kinds where needed, local kind cluster on podman
for dev and e2e. (CP3.7 ACCEPT) Connection-test summary hides "OpenShift version" and "List cluster operators" on Kubernetes.

## CP6 — Hardening, observability & polish
Caching of discovery (access caching moved to CP4.5), rate limiting, security review pass, OpenTelemetry
dashboards, Playwright e2e suite, accessibility pass, dark mode, docs.

## Backlog / ideas (product owner adds here)
- OIDC/SSO login (groups for grants → CP4.5).
- Fleet-wide search ("where is image X running?").
- Change windows policy (block mutations on prod outside business hours).
- Per-cluster favourites and pinned resources.
- (CP3.7 spec) Filter the admin Clusters list and the switcher by distribution (`OCP`/`K8s`) and environment.
- (CP3.7 spec) "Fix distribution" quick action from the DIST-7 mismatch warning (one click to the edit form, field focused).
- (CP3.7 spec) Show the saved inspect namespaces in the Credentials list as a hover hint for namespaced SAs.
- Fleet access matrix (users × clusters, edit in place); bulk grant many users to one cluster; bulk re-assign grants between credentials.
- Group-based grants using OCP groups recorded in CP1.
- Time-bound / break-glass grants (auto-revert, audited).
- Scheduled credential checks + expiry notifications (email/webhook).
- Token auto-renewal via TokenRequest with a minimal "token minter" SA per cluster.
- Audit export (CSV/JSON), retention policy, SIEM forwarding.
- Optional OCP OAuth logout redirect (`Auth:LogoutRedirectUrl`).
- Cluster labels (region, owner team, tier) for filtering.
- (CP1 ACCEPT) "Copy access from user…": grant a new SRE the same clusters/modes/credentials as a teammate in one step.
- (CP1 ACCEPT) Offboarding: "Revoke all grants" on a user (deactivate keeps grants) and bulk revoke on a cluster's Access tab.
- (CP1 ACCEPT) Fleet administration overview page: counts of users, clusters, expiring/expired credentials, failed last tests, with filtered links.
- (CP1 ACCEPT) "Test all credentials" button (on demand, bounded concurrency) on the Credentials page; precursor of scheduled checks.
- (CP1 ACCEPT) Credential "last used" (from proxy audit, CP2+) to find stale SA tokens before rotation/deletion.
- (CP1 ACCEPT) Audit entries link their target (user/cluster/credential) to its admin page; "View in audit log" from detail pages.
- (CP1 ACCEPT) Masthead link-out to the cluster's own OCP web console (URL already stored per cluster) for features we don't cover yet.
- (CP3 Q10) Trust `X-Forwarded-For` from the Route and record the client IP in audit entries (CP6).
- (CP3 T-0103) DP certificate rotation supports one previous cert only: accept a list of previous certs, or add a re-encrypt-all-keys command, so repeated rotations never orphan old keys.
- (CP3 spec) Instance banner / masthead text per deployment (e.g. "consolinho on test-cluster-17").
- (CP3 spec) Argo CD Application + example `production` overlay repo layout.
- (CP3 spec) Prometheus metrics endpoint + ServiceMonitor; alerts for login failures and proxy 5xx rate.
- (CP3 spec) Self-registration of the host cluster as a managed cluster (one click, admin only).
- (CP3 spec) DP certificate rotation helper (script or admin page showing key ring age/expiry).
- (CP3 ACCEPT) `deploy-dev.sh --register-self`: automate the 4 smoke steps (SA token, register host cluster, credential, grant) after every test-cluster reinstall.
- (CP1 ACCEPT, for CP2 spec) Extend the token-leak sweep and authz matrix to proxy routes (QA R4); proxy strips client `Authorization`.
- (CP3.5 ACCEPT) Audit log: human labels for proxy actions (`proxy.update` → "Updated <kind>", denied → "Denied: …"); raw ids only in the expanded row. Needs the id list from the backend.
- (CP3.5 ACCEPT) Admin source as structured data (`kind` + `group`) in the users API instead of the "Admin granted by configuration (…)" string the SPA parses.
- (CP3.5 ACCEPT) YAML tab like OCP `edit-yaml.tsx`: Save / Reload / Cancel, Save always enabled (CP4 YAML work).
- (CP3.5 ACCEPT) Absolute `Timestamp` (globe icon, relative tooltip) in list "Created" columns too, as in OCP.
- (CP3.6 ACCEPT) Switcher toggle: never clip the cluster name ("prod…") for its labels; drop "Read only" before the name (prod-eu-1 vs prod-us-1).
- (CP3.6 ACCEPT) Events card timestamp crowds the object name at 375px.
