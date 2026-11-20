# Roadmap — checkpoints

Each checkpoint ends with something demonstrable. The orchestrator runs one checkpoint autonomously, then stops for
the human. Status: `planned` → `in_progress` → `done`.

| CP | Name | Status |
|---|---|---|
| 0 | Foundations | done (tag cp-0) |
| 1 | Identity & administration | done (tag cp-1) |
| 2 | Proxy, cluster switcher & generic resource browser (MVP) | in_progress |
| 3 | Deploy to OpenShift | planned |
| 4 | Workloads day-2 operations | planned |
| 5 | Networking, storage, compute & cluster overview | planned |
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

## CP4 — Workloads day-2 operations
Pods (logs with follow/container select/download, exec terminal via WebSocket, delete, events), Deployments/DC
(scale, rollout restart, pause/resume, revision history), StatefulSets, DaemonSets, ReplicaSets, Jobs, CronJobs
(trigger now, suspend), ConfigMaps/Secrets (reveal with confirm, edit), HPA. Search across kinds by label.

## CP5 — Networking, storage, compute & cluster overview
Services, Routes (with link-out), Ingresses, NetworkPolicies; PVCs, PVs, StorageClasses; Nodes (cordon/drain view,
conditions, allocatable), MachineSets (read), Projects; cluster overview dashboard (ClusterVersion, ClusterOperators
health, node status, recent warning events); Operators (CSV/Subscription read-only); fleet view: status of all clusters
on one page.

## CP6 — Hardening, observability & polish
Caching (`CachingBehavior` for access resolution + discovery), rate limiting, security review pass, OpenTelemetry
dashboards, Playwright e2e suite, accessibility pass, dark mode, docs.

## Backlog / ideas (product owner adds here)
- OIDC/SSO login; groups for grants.
- Fleet-wide search ("where is image X running?").
- Change windows policy (block mutations on prod outside business hours).
- Per-cluster favourites and pinned resources.
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
- (CP1 ACCEPT, for CP2 spec) Extend the token-leak sweep and authz matrix to proxy routes (QA R4); proxy strips client `Authorization`.
