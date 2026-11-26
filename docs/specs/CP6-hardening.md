# CP6 — Hardening, observability & polish (spec)

Status: draft (product owner, 2026-11-26). Scope source: ROADMAP CP6, HANDOVER follow-ups, T-0390, CP6 tasks
T-0107, T-0108, T-0128, T-0130, T-0134. **No new features**: every criterion makes something that exists safer,
observable, recoverable, tested or documented.

## 1. Problem and goal

FleetConsole now covers day-2 work on ~40 OpenShift and Kubernetes clusters, but it is not yet something on-call
would trust as the *only* console:

1. **Fragile under failure.** A transient discovery 503 (API server restart) leaves the sidebar on core kinds until a
   reload (T-0390) — required before Kubernetes clusters go to production. Editing a cluster cuts followed log streams
   ~6 min later (T-0058). A deploy makes open tabs fail on lazy chunks with a blank page (T-0028). The live events
   cache grows without bound on "All projects" (T-0130).
2. **Weak edges.** Only the fleet-status endpoint is rate limited; login and proxy are not. The OAuth callback URL
   (with `code`/`state`) can reach logs/traces (T-0015). A missing DP certificate surfaces as decrypt failures at runtime
   instead of a startup error (T-0012). DP rotation keeps one previous cert only, so a second rotation orphans keys.
   Audit records the Route's IP, not the client's.
3. **Blind in production.** OTel exists for dev (Aspire dashboard) but there is no scrape endpoint, dashboard or alert
   for FleetConsole itself on OpenShift, and the keyring health check logs an Error on every cold start (alert noise).
4. **Untested end to end as a gate, and not audited for a11y.** Playwright specs exist (`web/e2e/*.e2e.ts`) but are run
   by hand; nobody has run an automated accessibility check; T-0128/T-0134 are known a11y gaps.
5. **Docs gaps** an on-call admin hits (T-0108 runbook, T-0107 `deploy-dev.sh --help`).

Goal: FleetConsole degrades gracefully, protects its edges, tells its operators when it is unhealthy, and has a
repeatable e2e + a11y gate. Split:

- **CP6a — Backend hardening, security & observability** (+ ops docs). Tag `cp-6a`.
- **CP6b — Frontend resilience, accessibility & e2e gate.** Tag `cp-6b`. Can run in parallel with CP6a (no shared paths);
  OBS/SEC ACs that need FE evidence are verified in CP6b's VERIFY.

Dark mode already exists (`web/src/shared/theme/ThemeProvider.tsx`, User Preferences theme). It is **not rebuilt**;
it is reduced to a dark-theme contrast check inside the a11y pass (A11Y-4).

## 2. Personas

- **Priya, on-call SRE:** uses FleetConsole during incidents, often while clusters are flapping; the console must not
  get stuck or blank when an API server or our own pod restarts.
- **Ola, FleetConsole admin:** runs the FleetConsole deployment; rotates certs and OAuth secrets, answers "who did
  what from where", and wants an alert before users complain.
- **Sam, security reviewer:** signs off FleetConsole before more prod clusters are added.
- **Keyboard / screen-reader user:** must reach every day-2 action without a mouse.
- **Dev/QA (us):** need one command that proves the golden paths still work.

## 3. User stories

- US-1 As Priya I want the sidebar to recover by itself after a cluster's API server blips, so that I don't reload mid-incident.
- US-2 As Priya I want followed logs and open tabs to survive an admin's cluster edit and a FleetConsole deploy.
- US-3 As Ola I want audit entries to show the real client IP, so that I can trace an action to a workstation.
- US-4 As Ola I want dashboards and alerts for login failures, proxy errors and latency per cluster, so that I see
  FleetConsole trouble before users do.
- US-5 As Ola I want to rotate the DP certificate as often as policy demands without losing stored SA tokens.
- US-6 As Sam I want login and proxy abuse throttled and secrets kept out of logs, with a written review I can read.
- US-7 As a keyboard user I want every list, filter, favourite and action to work with the keyboard and announce itself.
- US-8 As a developer I want `scripts/check-e2e.sh` to run the golden paths and the a11y scan with one summary.

## 4. Acceptance criteria

## CP6a — Backend hardening, security & observability

### 6a.1 Discovery caching (DC) — backend
FE already caches discovery per session (`staleTime: Infinity`); the cost is the first load on each of ~40 clusters and
every user repeating it. Cache server-side, never across trust boundaries.
- **DC-1** The proxy serves `GET /api`, `/apis` (incl. aggregated discovery `Accept: application/json;g=apidiscovery.k8s.io;v=v2…`)
  and `/version` for a cluster from a cache keyed by **cluster + credential** (never shared between credentials), after
  the normal grant/authz checks. Other paths are never cached.
- **DC-2** TTL configurable (`Proxy:DiscoveryCacheSeconds`, default 60). Errors (non-2xx) are never cached.
- **DC-3** Credential rotation, cluster edit/delete and grant revoke invalidate the entry (existing access-cache tags, ADR-0040).
- **DC-4** Response is byte-identical to the uncached one (content type, body); `Vary: Accept` respected — the v2
  aggregated and legacy forms are separate entries. Test proves both.
- **DC-5** Metric `fleetconsole.proxy.discovery_cache` (hit/miss, by cluster) exported.

### 6a.2 Rate limiting (RL)
- **RL-1** Login start and OAuth callback are limited per client IP (fixed window, default 20/min, configurable);
  exceeding returns 429 ProblemDetails with `Retry-After`, audited once per window as `auth.rate_limited`.
- **RL-2** Proxy **mutations** (POST/PUT/PATCH/DELETE, exec/attach upgrades) are limited per user (token bucket,
  default 30/10 s burst, configurable); reads, watches and log streams are **not** limited (a watch must never be cut).
- **RL-3** Limits use the client IP from XFF (FWD-1), not the Route IP; one noisy user never throttles another (test).
- **RL-4** The existing fleet-status concurrency limiter is unchanged; all policies documented in `BACKEND.md`.

### 6a.3 Client IP and forwarded headers (FWD)
- **FWD-1** `X-Forwarded-For`/`-Proto` are honoured only from configured trusted proxies (`ForwardedHeaders:KnownNetworks`,
  default the pod network CIDR from the manifests); otherwise ignored. Spoofed XFF from a non-trusted source is ignored (test).
- **FWD-2** Every audit entry (admin and proxy) stores `clientIp`; shown in the audit log expanded row. Migration adds
  the nullable column; old rows show "—".
- **FWD-3** XFF headers are still stripped before forwarding to clusters (SECURITY.md header policy unchanged).

### 6a.4 Secrets out of telemetry (T-0015) and startup safety (T-0012)
- **SEC-1** The OAuth callback query string (`code`, `state`, `error_description`) never appears in logs, traces
  (`url.query`, `url.full`, `http.target`) or metrics tags; test captures logs + activities of a full login and asserts.
- **SEC-2** The existing token-leak sweep is extended to proxy routes (incl. exec/logs WebSocket) and the new 429/audit
  paths: no SA token or session cookie in any log, trace, ProblemDetails or audit field.
- **SEC-3** Given DP is configured for certificate protection and the cert (or its password) is missing/unreadable, When
  the Api starts, Then startup fails with one clear log line naming the missing path — no partial start (test).

### 6a.5 Data Protection rotation (DPR)
- **DPR-1** Previous certificates are a **list** (e.g. `DataProtection:PreviousCertificates:0..n` / a mounted directory);
  keys protected by any listed cert stay readable.
- **DPR-2** Test: rotate twice (A→B→C) with A and B listed; tokens encrypted under each key generation still decrypt.
- **DPR-3** RUNBOOK rotation procedure updated: when a previous cert may be removed (after key-ring re-protection or
  key expiry), with a verification step. Single-previous-cert config stays accepted (backward compatible).

### 6a.6 Forwarding pool keeps streams alive (T-0058)
- **FP-1** Given Priya follows a pod's logs (or has exec open), When Ola edits that cluster (URL/CA/credential), Then
  new requests use the new client immediately and the open stream continues until it ends naturally or the user closes it.
- **FP-2** The old handler is disposed only after its last in-flight request completes (or after a bound, default 1 h,
  logged). Test with a long-lived fake stream across an invalidation; no socket leak.

### 6a.7 Observability for FleetConsole itself (OBS)
- **OBS-1** Prometheus scrape endpoint `/metrics` on a **separate management port** (not exposed by the Route);
  `/healthz`/`/readyz` unchanged.
- **OBS-2** Metrics at least: login success/failure (by reason), proxy requests by cluster/verb/status class + duration
  histogram, upstream errors/timeouts by cluster, active watch/log/exec streams, rate-limit rejections, access-cache and
  discovery-cache hit ratio, DB/Redis health. **No user names or resource names as labels** (cardinality + privacy);
  cluster id is allowed (~40).
- **OBS-3** `deploy/kustomize` optional component: ServiceMonitor (user-workload monitoring) + PrometheusRule with alerts:
  login failure ratio, proxy 5xx ratio per cluster, readiness down, DP keyring unhealthy > 5 min. Each alert has a
  runbook anchor in `docs/ops/RUNBOOK.md`.
- **OBS-4** Dashboard JSON (Grafana-compatible; also importable into Perses/OCP console dashboards where available) in
  `deploy/observability/`, panels for OBS-2; screenshot or documented query evidence from consolinho.
- **OBS-5** Keyring health: "Key ring not loaded yet" during cold start reports **Degraded** and logs at **Warning once**;
  Unhealthy/Error only if still not loaded after a grace period (default 60 s). Test.
- **OBS-6** Traces: proxy spans carry `fleetconsole.cluster` and `http.response.status_code`; no request bodies.

### 6a.8 Security review pass (SRV)
- **SRV-1** `docs/architecture/SECURITY.md` gets a dated "CP6 review" section: walk of OWASP ASVS L2 areas relevant to us
  (session/cookies, CSRF, CSP, SSRF via cluster URL, authz on every admin/proxy route, header policy, secrets at rest,
  dependency and image vulnerabilities), each marked ok / finding with task id.
- **SRV-2** `dotnet list package --vulnerable --include-transitive` and `npm audit --omit=dev` report no high/critical
  (or each is waived with reason in SRV-1); script added to `scripts/` and referenced from SDLC review checklist.
- **SRV-3** Every **high** finding is fixed inside CP6; medium/low become backlog tasks.
- **SRV-4** (CP4.5b ACCEPT R1, see Q5) The cache backplane is subscribed before readiness passes, so a just-started pod
  cannot miss a revoke.

### 6a.9 Ops docs (DOC-A)
- **DOC-1** T-0108: RUNBOOK covers OAuth client-secret rotation, "which version is running", undecryptable credentials
  (symptom → fix), backup/restore drill — each with copy-paste commands and a verify step.
- **DOC-2** T-0107: `scripts/deploy-dev.sh --help` is operator language with examples; no AC ids/ADR/agent jargon.
- **DOC-3** RUNBOOK sections for every OBS-3 alert, rate-limit tuning, XFF trusted networks, DP multi-cert rotation.

### 6a.10 Quality gates (QG6A)
- **QG6A-1** `scripts/check-be.sh` green; each AC above has a named test or documented manual evidence.
- **QG6A-2** Deployed to consolinho; OBS-1 scrape works under user-workload monitoring (or documented why not on that cluster).

## CP6b — Frontend resilience, accessibility & e2e gate

### 6b.1 Discovery recovery (DR, T-0390) — before Kubernetes production
- **DR-1** Given discovery for the active cluster fails (5xx/network), Then the app keeps the **last good** result if any
  (else baseline kinds), shows a small inline warning in the nav area ("Some resource types could not be loaded. Retrying…"),
  and retries every 30 s (OCP `api-discovery.ts:startAPIDiscovery`).
- **DR-2** When a retry succeeds, the sidebar and `isServed` update without reload and the warning disappears.
- **DR-3** 401/403 on discovery are not retried in a loop (they follow the existing session/permission handling).
- **DR-4** Polling stops for clusters that are not active and while the tab is hidden; switching back resumes.
- **DR-5** Successful discovery is still re-checked at most every 5 min in the background (OCP polls; new CRDs/operators
  appear without reload) — see Q2.

### 6b.2 Chunk-load recovery (T-0028)
- **CL-1** Given a new FleetConsole version is deployed while a tab is open, When a lazy route chunk fails to load, Then
  the page shows a PF alert "A new version of FleetConsole is available" with a **Reload** button — never a blank page.
- **CL-2** Automatic reload at most once per session (guarded, no reload loops); test with a mocked import failure.

### 6b.3 Bounded watch caches (T-0130)
- **BW-1** The live events cache keeps at most N events (default 500, newest wins) regardless of watch volume; memory
  stays flat in a test that pushes 10 000 events.
- **BW-2** Same bound mechanism is available to other watched lists (documented in `FRONTEND.md`); no visible change in
  the Events page/tabs.

### 6b.4 Accessibility pass (A11Y)
- **A11Y-1** `@axe-core/playwright` runs on: fleet overview, a resource list (Pods), a details page (Deployment) with
  YAML/Events tabs, logs tab, an action modal, admin Users and Clusters lists, User Preferences, login. Zero **serious**
  or **critical** violations (WCAG 2.1 AA rules); moderate ones listed in the report with tasks.
- **A11Y-2** T-0128: favourite-remove button is a sibling of the nav link (same OCP look); label-filter suggestions have
  listbox semantics and arrow/Enter/Escape keys.
- **A11Y-3** T-0134: Add-to-favourites modal focuses Name on open (OCP).
- **A11Y-4** Dark mode (existing): axe colour-contrast passes on the same pages in dark theme, including prod cluster
  colouring and the switcher; no rebuild.
- **A11Y-5** Keyboard walk (documented in the spec acceptance): switch cluster, open project, find a failing pod,
  open logs, run a kebab action and confirm — all without a mouse, focus visible and returned after modals close.

### 6b.5 Playwright e2e gate (E2E)
- **E2E-1** `scripts/check-e2e.sh` starts (or reuses) Aspire, runs the Playwright suite + A11Y-1 scan, prints a summary
  and the full-log path like the other check scripts; referenced from SDLC as the checkpoint VERIFY gate.
- **E2E-2** Golden paths covered (existing specs extended, not rewritten): login/logout; cluster switch with prod
  colouring and cluster-named confirmation; read-only user cannot mutate; find failing pod → logs → events; scale and
  restart deployment; edit ConfigMap via YAML; admin grant → user sees cluster; DR-1/DR-2 with a fake discovery 503;
  CL-1 with a forced chunk failure.
- **E2E-3** Suite is stable: 3 consecutive full green runs locally; flaky tests fixed or quarantined with a task.
- **E2E-4** `kubernetes.e2e.ts` (kind) stays opt-in (`E2E_KIND=1`) and is documented in the script help.

### 6b.6 Quality gates (QG6B)
- **QG6B-1** `scripts/check-fe.sh` and `scripts/check-e2e.sh` green.
- **QG6B-2** UX review: DR warning and CL alert match OCP copy/style (OCP has no direct counterpart for CL; use PF
  inline `Alert` variant warning as OCP's nav/page alerts do).
- **QG6B-3** Deployed to consolinho after `cp-6b`.

## 5. UX notes

- DR warning: PF `Alert` `isInline isPlain variant="warning"` at the top of the nav, one line; no toast spam (one per
  failure episode). Last-good kinds stay clickable.
- CL alert: page-level PF `Alert` warning with an action link "Reload"; text: "A new version of FleetConsole is
  available. Reload to continue." No modal.
- 429 from proxy mutations: the existing action-error path shows "Too many requests to <cluster>. Try again in N s."
  (cluster named, as every mutation message).
- Audit log expanded row adds "Client IP"; not a list column (keep OCP-like density).
- No new pages, nav entries or settings in the SPA.

## 6. Out of scope (CP6)

- Any new feature or page (namespaces UX, CRDs/generic kinds, API explorer, metrics datasource → CP6.5; web terminal → CP7).
- Metrics *of managed clusters* (Prometheus/Thanos proxy) — CP6.5 candidate; CP6 is FleetConsole's own telemetry.
- Rebuilding dark mode; theme editor.
- CI pipeline/Argo CD (backlog); load testing beyond existing `deploy/loadtest` smoke.
- Refactor-only backlog tasks (T-0349, T-0350, T-0380, T-0367) unless an architect bundles them into a touched path.
- DP key-ring admin page / rotation helper UI (backlog).

## 7. Open questions (with recommendation)

> **Human decision 2026-11-26:** discovery timing as specced — 30 s retry while failing (with nav warning), 5 min
> re-check after success (DR-1, DR-5, Q2); deliberate deviation from OCP's flat 60 s poll. **Q1–Q8 approved as
> recommended.** Architect items approved: 429-rejected mutations are not audited (log line + metric instead);
> rate limits are per pod; startup errors may name the DP cert *path* (exception to ADR-0028 §6); trusted networks
> configurable, manifests set pod + machine CIDR as needed; prerelease Prometheus exporter accepted (pinned); T-0412
> deploy check may be skipped if user-workload monitoring is off on consolinho (→ Needs human); T-0410 verify-only.

| # | Question | Recommendation |
|---|---|---|
| Q1 | Discovery cache key: per cluster (shared) or per cluster + credential? | **Cluster + credential** (DC-1): discovery can be RBAC-restricted; sharing across credentials risks leaking served APIs. ~40 clusters × few credentials is small. |
| Q2 | After a *successful* discovery, keep `staleTime: Infinity` or re-poll? | **Background re-check every 5 min** (DR-5), cheap with DC-1, so newly installed operators/CRDs appear (prereq for CP6.5 G1). OCP polls continuously. |
| Q3 | Metrics format: Prometheus scrape or OTLP push to a collector? | **Prometheus scrape on a management port** (OBS-1): OpenShift user-workload monitoring is there on every cluster; OTLP stays for dev/Aspire and optional collectors. |
| Q4 | Rate-limit proxy reads too? | **No** (RL-2): lists/watches are the console's heartbeat and the cluster's APF already protects the API; limit only logins and mutations. |
| Q5 | Pull CP4.5b ACCEPT R1 (backplane readiness) into CP6? | **Yes** (SRV-4): it is a revoke-latency security gap; small. Leave the `system:` group tolerant-read item in backlog. |
| Q6 | Trusted proxies default? | **Pod/cluster network CIDR from the manifests** (configurable); never "trust all". Route HAProxy appends XFF. |
| Q7 | Is an automatic reload on chunk failure acceptable? | **Once, then alert** (CL-2): a silent reload can discard a half-typed YAML edit; prefer the alert when a form is dirty. |
| Q8 | Where does the dashboard live for admins without Grafana? | **Ship Grafana JSON + document the PromQL** for the OCP console Observe → Metrics page; no dashboard ConfigMap in `openshift-config-managed` (needs cluster-admin). |

## 8. Backlog candidates (to append to ROADMAP §Backlog on acceptance)

- DP key-ring age/expiry admin view (exists in backlog: rotation helper).
- Per-cluster SLO view in Fleet overview built from OBS-2 metrics.
- Moderate axe findings not fixed in CP6 (from A11Y-1 report).

## CP6a design

Backend architect, 2026-11-26. ADRs: 0042 (forwarded headers, client IP, rate limits), 0043 (metrics, management port), 0044 (discovery cache).

| Task | Title | Size | Depends on |
|---|---|---|---|
| T-0400 | Trusted forwarded headers (FWD-1/3) | S | — |
| T-0401 | Audit client IP (FWD-2; FE T-0428) | M | — |
| T-0402 | Login rate limit (RL-1/3) | M | T-0400 |
| T-0403 | Proxy-mutation rate limit (RL-2/3/4; FE T-0428) | M | T-0402 |
| T-0404 | Discovery cache building blocks (DC-1/3) | S | — |
| T-0405 | Discovery cache in the proxy + metric (DC-1/2/4/5) | M | T-0404, T-0403 |
| T-0406 | Prometheus endpoint on management port (OBS-1) | M | — |
| T-0407 | Metrics instruments + health publisher (OBS-2/6) | M | T-0406, T-0405 |
| T-0408 | Readiness: keyring grace, backplane (OBS-5, SRV-4) | M | — |
| T-0409 | DP previous-certificate list (DPR-1..3, SEC-3) | M | — |
| T-0410 | Pool retirement verification (FP-1..3; already ADR-0036) | S | — |
| T-0411 | Telemetry secret sweep (SEC-1/2) | M | T-0403, T-0407 |
| T-0412 | Monitoring component, alerts, dashboard (OBS-3/4, DOC-3) | M | T-0407, T-0408 |
| T-0413 | `check-deps.sh` (SRV-2) | S | — |
| T-0414 | CP6 security review, architect (SRV-1/3) | M | T-0400..0405, 0409, 0411, 0413 |
| T-0107 / T-0108 | Existing DOC-1/DOC-2 tasks | — | — |

Lanes (≤ 2 BE engineers): **BE-A (proxy/edge, serial: same files)** 0400 → 0402 → 0403 → 0405 → 0407 → 0411;
**BE-B (independent)** 0404 → 0401 → 0406 → 0408 → 0409 → 0410 → 0413 → 0412 → 0107/0108. 0404 must land before BE-A
reaches 0405, 0406 before 0407. Architect: 0414 last. FE T-0428 starts after 0401 + 0403.

## CP6b design

Frontend architect, 2026-11-26. No new ADR (recovery, bounds and the e2e gate extend ADR-0022/FRONTEND.md and are documented there).

| Task | Title | Size | Depends on |
|---|---|---|---|
| T-0390 | Discovery recovery (DR-1..5) | M | — |
| T-0420 | Chunk-load recovery (CL-1/2) | S | — |
| T-0130 | Bounded watch caches (BW-1/2) | M | — |
| T-0128 / T-0134 | Favourites + label-filter a11y / modal autofocus (A11Y-2/3) | S/M, S | — |
| T-0421 | `check-e2e.sh` + axe harness (E2E-1/4) | S | — |
| T-0422 | Axe scans light/dark + report (A11Y-1/4) | M | T-0421 |
| T-0423 | Fix serious/critical findings | TBD (split after T-0422) | T-0422 |
| T-0424 | Keyboard walk + focus return (A11Y-5) | M | T-0421, T-0422, T-0134 |
| T-0425 | Golden-path gaps (E2E-2) | M | T-0421, T-0422 |
| T-0426 | DR/CL e2e (E2E-2) | S | T-0390, T-0420, T-0421 |
| T-0427 | Stability: 3 green runs (E2E-3, QG6B-1) | S | T-0423..T-0426, T-0128 |
| T-0428 | CP6a SPA: audit Client IP, 429 message (FWD-2, RL-2) | S | BE FWD-2 + RL-2 tasks |
| T-0429 | UX review of DR/CL alerts (QG6B-2) | S | T-0390, T-0420 |

Lanes: **FE-A** T-0390 → T-0420 → T-0128 → T-0134 (cheap); **FE-B** T-0130, then T-0423/T-0424; **QA** T-0421 → T-0422 →
T-0425 → T-0426 → T-0427. FE-A and FE-B touch disjoint paths and can run in parallel with the QA lane.
