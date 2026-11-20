# CP2 — Proxy, cluster switcher & generic resource browser (spec)

**Author:** ocp-product-owner · **Date:** 2026-11-20 · **Checkpoint:** CP2 · **Branch:** `cp/2-proxy-browser`
**Binding inputs:** ROADMAP CP2, ADR-0003 (YARP `IHttpForwarder`), SECURITY.md (Authorization, Token handling, Proxy
hardening, Audit, CSRF), CP1 acceptance decisions D1–D3 (`docs/specs/CP1-acceptance.md`).
**Already-filed carry-ins (not re-specified here):** T-0053 "Fleet administration" nav label, T-0054 Playwright smoke
H1–H4, T-0055 user-facing rebrand to Consolinho. UI copy below says "the console"; the product name comes from T-0055.

## 1. Problem and goal

After CP1, operators can log in and see *which* clusters they may use, but every cluster page is a placeholder. CP2
makes FleetConsole useful for the first daily task: **open a cluster, pick a project, find the broken thing, read its
YAML and events, fix it, and be sure which cluster you are on.**

1. **Proxy**: every Kubernetes call from the browser goes through `/api/clusters/{cluster}/k8s/**`, authenticated with
   the SA token of the user's grant, never with anything the browser sent. ReadOnly grants and read-only users are
   enforced server-side. Every mutation (allowed or denied) is audited.
2. **Switcher that is fast and safe**: search, recents, environment colour everywhere, and switching cluster keeps you on
   the same page so you can compare `prod-eu-1` and `prod-us-1` in two clicks.
3. **Generic resource browser**: one registry-driven list / details / YAML / events implementation, proven on six
   kinds: Projects/Namespaces, Pods, Deployments, Services, ConfigMaps, Events. Lists update live via watch.
4. **Honest permissions**: actions the user can't perform are visible but disabled, with the reason (read-only grant,
   read-only user, or the cluster's RBAC for the SA).

**Demo at the end of CP2:** `aspire run` with the fake API server → `alice` (ReadOnly on `dev-1`) opens Pods in project
`shop`, a pod is deleted out-of-band and disappears from the list without reload, the YAML tab is read-only with
"Your access to dev-1 is read-only" → `sam` (ReadWrite) edits a ConfigMap in YAML, saves, gets a conflict on a stale
edit, reloads, saves → switches to `dev-2` from the switcher search and lands on the same ConfigMap list → admin opens
the audit log and sees sam's PUT and alice's denied attempt (made via curl).

## 2. Personas

| Persona | What they need from CP2 |
|---|---|
| **Operator** (Sam, ReadWrite) | Find a failing pod fast, read YAML/events, edit a ConfigMap/Deployment, delete a stuck pod, hop clusters without losing context |
| **Read-only operator** (Alice) | Browse everything the SA can read; understand *why* she can't change things; zero chance of an accidental write |
| **Fleet admin** (Priya) | Trust that the proxy can't leak SA tokens or widen access; see every proxy mutation in the audit log |
| **Auditor** (Ines) | Filter the audit log by cluster and see who changed what through the console, including denied attempts |

## 3. User stories

- US-1 As an operator I want to search the cluster switcher and see my recent clusters first so that I reach any of 40 clusters in under 3 seconds.
- US-2 As an operator I want switching cluster to keep my current page (kind, project, name) so that I can compare the same object across clusters.
- US-3 As an operator I want the environment colour and name visible in the masthead and in every confirmation so that I never act on production by mistake.
- US-4 As an operator I want a project selector with "All projects" that remembers my last project per cluster so that I don't re-pick it on every page.
- US-5 As an operator I want resource lists with name and label filters that update live so that I see pods crash and restart without refreshing.
- US-6 As an operator I want Details / YAML / Events tabs on every resource so that my OCP console muscle memory works.
- US-7 As an operator I want to edit YAML and be told clearly about conflicts and validation errors so that I don't overwrite someone else's change.
- US-8 As a read-only operator I want disabled actions to tell me why so that I know whom to ask.
- US-9 As a fleet admin I want the proxy to forward only the grant's SA token and strip everything else so that browser credentials never reach clusters and SA tokens never reach browsers.
- US-10 As an auditor I want every write through the console in the audit log with user, cluster, resource and outcome so that changes are traceable.
- US-11 As an operator I want URLs shaped like the OCP console's (`/k8s/ns/<ns>/pods/<name>`) so that I can translate links from tickets by hand.

## 4. Acceptance criteria

Conventions: "grant" = the user's active grant for that cluster (CP1). "Not available" = the CP1 SW-5 wording, which
never reveals whether a cluster exists. Proxy errors raised by FleetConsole are RFC 9457 ProblemDetails with a stable
`code` and a `detail` the UI shows verbatim; errors returned by the API server are passed through unchanged (Kubernetes
`Status` objects). Exact routes and codes are the architects' call (§6).

### 4.1 Proxy routing & access (PRX)

- **PRX-1 Route.** `/api/clusters/{cluster}/k8s/{**path}` forwards any method to `{cluster.apiServerUrl}/{path}` with
  the query string unchanged, streaming request and response bodies (ADR-0003).
- **PRX-2 Access.** The request is forwarded only if: session valid, user active, cluster enabled, user holds a grant
  for it, the grant's credential exists. Otherwise → 404 "not available" (same body for unknown cluster, disabled
  cluster, no grant, missing credential). Unauthenticated → 401 (SPA redirects to login as in CP1).
- **PRX-3 Immediate revocation.** Given an open session, when an admin revokes the grant, deactivates the user or
  disables the cluster, then the next proxied request is refused (no access cache in CP2). Open watch streams end
  within 5 minutes (Q6) and do not re-establish.
- **PRX-4 Path allowlist.** Only paths starting with `/api`, `/apis`, `/version`, `/openapi`, `/.well-known` are
  forwarded after normalisation; `..`, encoded traversal (`%2e%2e`, `%2f`), absolute URLs and other prefixes → 400
  `Proxy.PathNotAllowed`, nothing sent upstream.
- **PRX-5 Credential rejected.** Given the upstream answers 401 (expired/revoked SA token), then the proxy returns 502
  `Proxy.CredentialRejected` ("The cluster rejected the credential assigned to you for `<cluster>`. Ask a Fleet
  administrator to rotate it.") — **never 401**, so the SPA does not log the user out. Upstream 403 passes through.
- **PRX-6 Upstream failures.** Connection refused/DNS → 502 `Proxy.UpstreamUnavailable`; TLS validation failure →
  502 `Proxy.UpstreamTls` (detail names the cluster, not the certificate chain); timeout → 504. Details contain no
  token, no internal stack.
- **PRX-7 Per-cluster TLS.** Each cluster uses its own connection pool validating against its registered CA bundle
  (or the system trust when none); `SkipTlsVerify` is honoured only for that cluster. Given an admin changes a
  cluster's API URL, CA bundle or skip-TLS flag, then the next request uses the new settings. A CA from cluster A never
  validates cluster B (test with two fake servers and two CAs).
- **PRX-8 Timeouts.** Non-streaming requests time out (default 30 s, configurable). Watch (`watch=true` or
  `/watch/`) responses are streamed unbuffered: an event written by the fake API server reaches the client within
  1 s. Server caps `timeoutSeconds` on watches at 300 s (Q6).

### 4.2 Header hardening & token safety (SEC)

- **SEC-1 Request stripping.** The fake API server receives exactly one `Authorization: Bearer <grant SA token>` and
  none of: client `Authorization`, `Cookie`, `X-Console-Request`, `Impersonate-*` (User, Group, Uid, Extra-*),
  `X-Remote-*`, `X-Forwarded-*` from the client, hop-by-hop headers. Test sends each one with a recognisable value.
- **SEC-2 Response stripping.** `Set-Cookie` and `WWW-Authenticate` from upstream never reach the browser.
- **SEC-3 CSRF.** Proxy mutations without `X-Console-Request: 1` → 403 `Auth.CsrfHeaderMissing` (existing middleware,
  asserted for the proxy route), nothing forwarded.
- **SEC-4 Token-leak sweep extended (CP1 D3/R4).** `TokenLeakSweepTests` covers proxy routes: for allowed, denied,
  upstream-error, TLS-error and credential-rejected requests, the SA token value (and its base64 forms) does not appear
  in any response body/header, ProblemDetails, audit entry, or captured log line at any level.
- **SEC-5 Authorization matrix extended (CP1 D3/R4).** A table-driven test runs GET and PUT through the proxy for:
  anonymous (401), deactivated user (401), no grant (404), admin without grant (404), disabled cluster (404),
  ReadOnly grant (GET 200 / PUT 403), globally read-only user with ReadWrite grant (GET 200 / PUT 403), ReadWrite
  grant (200/200), missing CSRF header on PUT (403). Every proxy endpoint registered is in the matrix (enumeration test,
  like the CP1 anonymous-endpoint test).

### 4.3 Mutation guard (MUT)

- **MUT-1 Definition.** A mutation is any method other than GET/HEAD/OPTIONS, plus WebSocket upgrades to `exec`,
  `attach`, `portforward` (blocked for ReadOnly now; the UI arrives in CP4).
- **MUT-2 ReadOnly grant.** Given a ReadOnly grant, when any mutation is sent, then 403 `Proxy.ReadOnlyGrant`
  ("Your access to `<cluster>` is read-only.") and nothing is sent upstream.
- **MUT-3 Read-only user.** Given the global read-only flag, mutations on any cluster → 403 `Proxy.UserReadOnly`
  ("Your account is read-only."), checked before the grant mode.
- **MUT-4 Review allowlist.** `POST` to `selfsubjectaccessreviews` and `selfsubjectrulesreviews`
  (`authorization.k8s.io/v1`) are not mutations: allowed for ReadOnly and not audited. Nothing else is allowlisted
  (no `dryRun` exception, Q7).
- **MUT-5 Body limit.** Mutation bodies above a configurable limit (default 10 MiB) → 413, not forwarded.

### 4.4 Proxy audit (PAUD)

- **PAUD-1** Every mutation reaching the guard writes one audit entry, category `Proxy`: user, cluster, method,
  resource parsed from the path (group, version, resource, namespace, name, subresource), query `dryRun`/`fieldManager`
  if present, upstream status code, outcome (`Allowed`, `Denied` + reason code), correlation id, timestamp. No request
  or response body, no headers.
- **PAUD-2** Denied mutations (MUT-2/3/5) are audited; 404 "not available" requests are audited as `Denied` with reason
  `NoAccess` only for mutations. GETs and watches are not audited (OpenTelemetry traces only, path + status).
- **PAUD-3** If the upstream call fails or the client disconnects, the entry is still written with status
  `0`/`502`/`504`. An audit write failure never blocks the response but is logged at Error.
- **PAUD-4** The admin audit log page gets the `Proxy` category filter and shows resource as `ns/kind/name` and the
  outcome label; filter by cluster works for proxy entries.

### 4.5 Cluster switcher & context (SW, continues CP1 SW-1..6)

- **SW-7 Search.** The switcher menu has a search box focused on open; it filters by name, display name and
  environment (case-insensitive substring); Enter opens the first match; "No clusters match `<text>`" when empty.
  Usable with 40+ clusters without scrolling to find one.
- **SW-8 Recents.** A "Recent" group above "All clusters" shows up to 5 clusters last opened by this user in this
  browser (localStorage, keyed by username), excluding ones no longer granted; omitted when empty.
- **SW-9 Keep context on switch.** Given I am on a page of cluster A, when I pick cluster B, then I land on the same
  route on B (kind, namespace, name, tab). If the namespace or object does not exist on B, the page shows the normal
  404/empty state with a link to the kind's list on B — not an error page and not a redirect to `/`.
- **SW-10 Environment visibility.** The masthead shows the active cluster's name and environment label in the
  environment colour (production = red/danger, staging = orange/warning, development = green/success — same colours as
  CP1 CLU-7). Every mutation
  confirmation names the cluster and its environment label: the delete modal (UI-8), and next to the YAML Save button (UI-7).
- **SW-11 Fleet vs cluster nav (T-0053).** The sidebar shows the cluster sections (Home, Workloads, Networking,
  Administration) for the active cluster, and "Fleet administration" (admins only) as a separate section; no two
  headings read "Administration".

### 4.6 Project/namespace selector (NS)

- **NS-1** Namespaced pages show a project selector above the content: "All projects" + searchable list. Source:
  `project.openshift.io/v1 projects` when the cluster serves it, else `v1 namespaces`. The list is what the SA can see.
- **NS-2** Changing project changes the URL (`/k8s/ns/<ns>/...` ↔ `/k8s/all-namespaces/...`); the last choice is
  remembered per cluster and used when entering a namespaced list without one in the URL.
- **NS-3** Given the SA cannot list projects/namespaces, then the selector lets the user type a namespace name and shows
  "You can't list projects on `<cluster>`; enter a project name."
- **NS-4** A "Show default projects" toggle hides `openshift-*`, `kube-*`, `default` by default in the selector (OCP
  behaviour), remembered per browser.

### 4.7 Resource registry & data layer (DATA)

- **DATA-1 Registry.** Each kind is a model descriptor (group, version, plural, kind, namespaced, label, list columns,
  details fields, nav section). Adding a kind with default columns needs only a descriptor; the six CP2 kinds are:
  Project (OCP only) & Namespace, Pod, Deployment, Service, ConfigMap, Event (`v1`).
- **DATA-2 Discovery.** Kinds whose group/version the cluster doesn't serve are hidden from the nav (e.g. Projects on
  vanilla Kubernetes). Discovery is fetched once per cluster per session and on cluster switch.
- **DATA-3 Lists** are fetched in pages of 250 (`limit`/`continue`) until complete, then kept current by a watch from
  the list's `resourceVersion`. On `410 Gone` the list is re-fetched; on stream end/error the watch reconnects with
  backoff (1 s → 30 s). A "Live updates paused — retrying" indicator shows while disconnected.
- **DATA-4** A list of 2,000 pods renders, filters and receives watch updates without the page becoming unresponsive
  (component test with generated data; virtualised or paginated table is the frontend-architect's call).
- **DATA-5** Watches stop when the page unmounts or the cluster/namespace changes; no more than one watch per
  (cluster, kind, namespace, selector) per tab.

### 4.8 Pages (UI)

- **UI-1 Routes (OCP-shaped).** `/c/<cluster>/k8s/ns/<ns>/<plural>`, `/c/<cluster>/k8s/all-namespaces/<plural>`,
  `/c/<cluster>/k8s/ns/<ns>/<plural>/<name>[/yaml|/events]`, cluster-scoped `/c/<cluster>/k8s/cluster/<plural>/<name>`.
  Unknown plural → "Kind not supported yet" empty state.
- **UI-2 Nav.** Home: Projects, Events. Workloads: Pods, Deployments, ConfigMaps. Networking: Services.
  Administration: Namespaces. Active item highlighted; the cluster landing page goes to Projects.
- **UI-3 List page.** Title = kind plural, project selector (namespaced), name filter (client-side substring), label
  filter (`app=web,tier!=db`, sent as `labelSelector`), sortable columns, Namespace column only in all-projects mode,
  row kebab (Edit YAML, Delete), "Created" as relative time with absolute tooltip. Columns:
  Pods — Name, Namespace, Status (phase or waiting/terminated reason, e.g. `CrashLoopBackOff`), Ready (`1/2`),
  Restarts, Owner, Created; status filter (Running, Pending, Failed, Succeeded, CrashLoopBackOff, Unknown).
  Deployments — Name, Namespace, Status (`3 of 3 pods`), Labels, Pod selector, Created.
  Services — Name, Namespace, Type, Cluster IP, Ports, Selector. ConfigMaps — Name, Namespace, Keys (count), Created.
  Projects/Namespaces — Name, Display name, Status, Requester (projects), Created.
  Events — Type (Warning highlighted), Reason, Involved object (link if kind registered), Message, Count, Last seen;
  type filter Normal/Warning; sorted newest first.
- **UI-4 Details tab.** Common: name, namespace (link), labels (chips), annotations (count, expandable), created,
  owner references (link if kind registered, text otherwise). Kind-specific: Pod — phase, node, pod IP, QoS, containers
  table (name, image, state + reason, ready, restarts, last termination reason/exit code); Deployment — desired/
  current/ready/updated/available replicas, strategy, selector, conditions table; Service — type, cluster IP(s), ports
  table, selector (link to Pods list filtered by it), session affinity; ConfigMap — each key with its value in a
  read-only code block (binaryData keys listed with size); Namespace/Project — status, display name, description,
  requester.
- **UI-5 Events tab.** Events for the object (`involvedObject.uid` field selector), live, newest first, same columns
  as UI-3 without "Involved object". Empty: "No events — events are kept for about an hour by default."
- **UI-6 YAML tab (view).** Code editor with YAML highlighting, `managedFields` hidden by default (toggle to show),
  Download and Copy buttons, read-only when the user can't `update` (with the UI-9 reason in an inline alert).
- **UI-7 YAML tab (edit & save).** Save sends `PUT` with the edited object; success → toast "`<name>` saved on
  `<cluster>`" and the editor reloads the new version. 409 → inline alert "This object has been updated since you
  opened it" with **Reload** (discard my edits) — no silent overwrite; 422/400 → API server message verbatim, edits kept;
  invalid YAML or changed `kind`/`apiVersion`/`metadata.name`/`metadata.namespace` → client-side error, no request.
  Given the live object changes while I have unsaved edits, then a banner says "This object changed on the cluster"
  and my edits are not replaced. Leaving with unsaved edits asks for confirmation.
- **UI-8 Delete.** Kebab and details Actions menu → modal "Delete `<Kind>` `<name>`?" naming namespace, cluster and
  environment label; danger button; on success return to the list; failure → API message in the modal. Deleting a
  Namespace/Project additionally requires typing its name.
- **UI-9 `useCanI` gating.** Actions (Edit YAML save, Delete) are checked with SelfSubjectAccessReview for (verb,
  group, resource, namespace, name) — results cached per cluster for 60 s and de-duplicated. Disabled actions show a
  tooltip with the first applicable reason: (1) "Your account is read-only." (2) "Your access to `<cluster>` is
  read-only." (3) "The service account for `<cluster>` cannot `<verb>` `<resource>` in `<ns>` (cluster RBAC)." Reasons
  1–2 come from the session/cluster list and need no SSAR. While checking, actions are disabled without a tooltip.
- **UI-10 Error states.** List/details 403 → EmptyState "Restricted access" ("The service account for `<cluster>`
  can't list pods in `shop`."), 404 → "`<Kind>` `<name>` not found on `<cluster>`" + link to list; `Proxy.*` 502/504 →
  error state with the ProblemDetails `detail` and Retry; loading → skeleton table. Credential-rejected errors never
  trigger logout.

### 4.9 Quality gates (QG)

- **QG-1** Backend: proxy integration tests against an in-process fake API server (HTTPS with a test CA) covering PRX,
  SEC, MUT, PAUD, including streaming watch delivery (PRX-8) and two-cluster TLS isolation (PRX-7).
- **QG-2** Unit tests for path normalisation/allowlist, mutation classification and resource-path parsing (table-driven,
  incl. subresources such as `pods/eviction`, `deployments/scale`, core vs named groups).
- **QG-3** Frontend: MSW tests for each kind's list (loading/empty/403/error), watch add/modify/delete/410 relist, the
  YAML save success/409/422 paths, delete modal, disabled-action tooltips for all three reasons, switcher search/recents
  and keep-context switching, project selector fallback (NS-3).
- **QG-4** T-0054 (Playwright smoke H1–H4) is done in CP2 and extended with one browsing step: alice opens Pods on her
  cluster and sees the read-only YAML tab.
- **QG-5** `scripts/check-be.sh` and `scripts/check-fe.sh` green; no hand-written duplicates of generated admin types.

## 5. UX notes

- **Masthead:** `[logo] [cluster switcher: name + env label] ... [user menu]`. A thin colour band under the masthead
  in the environment colour for production and staging (none for development). Switcher menu: search, "Recent",
  "All clusters" grouped as in CP1 Q6, each item with env label and "Read only" label.
- **Page header:** breadcrumb `Projects › shop › Pods › web-7c9…` on details; title with a kind badge (`P`, `D`, `S`,
  `CM`, `NS` — OCP style) and status label; Actions dropdown right-aligned. Tabs: Details · YAML · Events only; no
  placeholder Logs/Pods tabs (CP4 adds them; tabs that do nothing erode trust).
- **Components:** PatternFly `Table` (compact) with `Toolbar` + `ToolbarFilter` chips; `Menu` + `SearchInput` for the
  switcher and project selector; `CodeEditor` (Monaco) for YAML; `Modal` (variant small, danger) for delete;
  `Tooltip` on disabled `Button`s (wrap in a span so the tooltip shows); `EmptyState` for 403/404/empty;
  `Label` for status (red for Failed/CrashLoopBackOff, orange for Pending, green for Running/Succeeded).
- **Live indicator:** small "Live" / "Paused — retrying" label next to the list title; never a modal.
- **Empty states:** "No pods found in `shop`" with "Clear filters" when filters are active.
- **Time:** relative ("3m ago") with absolute UTC + local tooltip.

## 6. Indicative API surface (architects own the final contract)

```
ANY  /api/clusters/{cluster}/k8s/{**path}        # proxy; GET watches streamed; WS upgrade blocked for ReadOnly
GET  /api/clusters                                 # CP1, unchanged (adds nothing secret)
GET  /api/admin/audit?category=Proxy&cluster=...   # CP1 endpoint, new category + resource fields
ProblemDetails codes: Proxy.NotAvailable(404) Proxy.PathNotAllowed(400) Proxy.ReadOnlyGrant(403)
  Proxy.UserReadOnly(403) Proxy.CredentialRejected(502) Proxy.UpstreamUnavailable(502) Proxy.UpstreamTls(502)
  Proxy.UpstreamTimeout(504) Proxy.BodyTooLarge(413) Auth.CsrfHeaderMissing(403)
```

## 7. Out of scope (CP2)

- **Pod logs, exec, attach, port-forward UI** (CP4; the proxy already streams and MUT-1 already guards the upgrades).
- Kinds beyond the six; Secrets (CP4, with reveal-confirm); Routes (CP5); search across kinds by label (CP4).
- Create from YAML / "+ Create" buttons; forms-based editing; label/annotation edit modals; scale/restart actions (CP4).
- Topology view, metrics (CPU/memory columns), cluster overview dashboard, fleet status page (CP5).
- Access-resolution and discovery caching (CP6); rate limiting (CP6).
- Keyboard shortcuts, favourites/pinned resources, type-to-confirm on production (backlog, §9).
- Multi-cluster lists (same kind across many clusters at once) — backlog.
- OCP Developer perspective.

## 8. Open questions (with recommendation)

| # | Question | Recommendation |
|---|---|---|
| Q1 | Pod logs in CP2? | **No.** Logs need follow, container select, previous-container, download — a feature, not a tab; doing it half-way would teach users to distrust it. CP2 gives container state + last termination reason + events, which answers most "why is it failing" questions; CP4 adds logs/exec on a proxy already proven for streaming. |
| Q2 | Delete in CP2? | **Yes**, generic kebab. It's the second most common write (stuck pods), it exercises MutationGuard/audit with a non-PUT verb, and it costs one modal. |
| Q3 | Create from YAML? | **No** → CP4. Needs per-kind templates to be useful. |
| Q4 | Projects vs namespaces source? | `projects` when served (it already filters by the SA's access, which suits namespace-scoped SAs), else `namespaces`; Administration › Namespaces always lists `namespaces`. |
| Q5 | Watch transport? | Plain HTTP chunked watch through the proxy (fetch streaming), no WebSocket — simpler and same path as lists. Architects confirm. |
| Q6 | How do open watches honour revocation without an access cache invalidation bus? | Cap watch `timeoutSeconds` at 300 s in the proxy; re-watch goes through PRX-2 again. ≤5 min exposure for **read** streams is acceptable; writes are checked per request. |
| Q7 | Allow `dryRun=All` mutations for ReadOnly grants? | **No** in CP2 — some admission webhooks have side effects and it complicates audit. Revisit if a "validate YAML" feature is requested. |
| Q8 | Keep context on cluster switch (SW-9)? | **Yes.** Comparing the same object across clusters is the core fleet benefit and OCP can't do it. |
| Q9 | Type-to-confirm for every mutation on production? | **No** in CP2 (only namespace delete). Env label in every confirmation + masthead band is enough; per-cluster "strict confirm" setting → backlog. |
| Q10 | Should GETs be audited? | **No** (volume; watches). OpenTelemetry traces carry user/cluster/path/status for forensics. |
| Q11 | Access resolution per request hits the DB — OK? | **Yes** for CP2 (one indexed query; correctness of PRX-3 matters more). Caching with invalidation is CP6. |

## 9. Proposed ROADMAP backlog additions (for the orchestrator to append)

- Keyboard shortcuts: `Ctrl/Cmd+K` cluster switcher, `/` focus list filter, `g p` go to Pods.
- "Open the same object on another cluster" side-by-side YAML diff (fleet drift check).
- Multi-cluster list: one kind (e.g. Pods in CrashLoopBackOff) across selected clusters.
- Per-cluster "strict confirm" setting: type the cluster name for any mutation on that cluster.
- Recently viewed resources (per cluster) on the cluster landing page.
- Shareable deep links that include a "cluster-agnostic" form (`/c/*/k8s/...` → prompts for cluster).
- "Validate only" (server dry-run) button in the YAML editor, allowed for ReadOnly grants if Q7 is revisited.
