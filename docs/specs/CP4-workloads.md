# CP4 — Workloads day-2 operations (spec)

**Author:** ocp-product-owner · **Date:** 2026-11-23 · **Checkpoint:** CP4 (split into CP4a / CP4b / CP4c) · **Branch:** `cp/4-workloads`
**Binding inputs:** ROADMAP §CP4 (scope + CP3.6/CP3.7 ACCEPT follow-ups), HANDOVER "Next actions" item 1 (fold-ins),
SECURITY.md §Authorization / §Proxy hardening / §Audit, UX.md (all sections), CLAUDE.md "UI north star".
**OCP references** (paths relative to `openshift-console/frontend`):
- Logs: `public/components/utils/resource-log.tsx` (WebSocket `base64.binary.k8s.io`, `DEFAULT_BUFFER_SIZE = 1000`,
  copy "Log streaming…", "Log stream paused.", "Log stream ended.", "Resume stream", "Current log"/"Previous log",
  "Wrap lines", "Show full log", "Download", "View raw logs", "Search logs"); tab `public/components/pod-logs.tsx`.
- Terminal: `public/components/pod-connect.tsx` (`exec` with `sh -i -c "TERM=xterm sh"`, `base64.channel.k8s.io`,
  "Connecting to" + container select, "The terminal connection has closed." + "Reconnect"); `public/components/terminal.tsx`.
- Tabs: `pod.tsx` L510 (Details, YAML, Environment, Logs, Events, Terminal), `deployment.tsx` L198 (Details, YAML,
  ReplicaSets, Pods, Environment, Events), `stateful-set.tsx`, `daemon-set.tsx`, `replica-set.tsx`, `job.tsx` L219,
  `cron-job.tsx` L407 (Details, YAML, Pods, Jobs, Events), `hpa.tsx` L231, `secret.tsx` L270.
- Actions: `packages/console-app/src/actions/hooks/useCommonActions.ts` (Edit labels / annotations / Pod count, Edit
  `<Kind>`, Delete `<Kind>`), `useDeploymentActions.ts` (Pause rollouts / Resume rollouts, Restart rollout disabled
  while paused, Start rollout for DC, Edit update strategy, Edit `<Kind>` → `/form`), `useReplicaSetActions.ts`
  (Rollback), `useJobActions.ts` (Edit parallelism), `useCronJobActions.ts` (Start Job → navigate to the new Job);
  modals `public/components/modals/configure-count-modal.tsx`, `rollback-modal.tsx`.
- Ring: `packages/console-shared/src/components/pod/PodRingSet.tsx` ("Increase the Pod count" / "Decrease the Pod count").
- Secrets: `public/components/configmap-and-secret-data.tsx` ("Reveal values" / "Hide values").
- Search: `public/components/search.tsx` + `search-filter-dropdown.tsx` (Resource multi-select, Label / Name filter,
  "Clear all filters", one result section per kind).
- Edit form: `packages/dev-console/src/components/deployments/DeploymentFormEditor.tsx` + `console-shared/.../synced-editor/editor-toggle.tsx`
  ("Configure via:" Form view / YAML view).
- Nav order (Workloads): `packages/console-app/console-extensions.json` L1116–1303.

## 1. Problem and goal

CP2–CP3.7 gave us a faithful, read-mostly resource browser with a generic YAML editor and Delete. The operator's daily
loop is still missing: *find the failing pod → read its logs → exec in → restart/scale the deployment → fix the
ConfigMap*. Today that means leaving FleetConsole for the cluster's own console — exactly the cluster-hopping we exist to
remove. CP4 delivers the Workloads day-2 operations with OCP's labels, tabs and modals, through the user's own SA token,
with read-only users and grants blocked before anything reaches the cluster, and every mutation naming the cluster it hit.

**Split (recommended).** CP4 is three checkpoints' worth of work. Each sub-checkpoint gets its own QA verify, PO
acceptance and tag (`cp-4a`, `cp-4b`, `cp-4c`) on the same branch, so the most-used workflows ship first:

| Sub | Theme | AC prefixes |
|---|---|---|
| **CP4a** | Pods + Deployments: logs, terminal, delete, scale (modal + ring), restart, pause/resume, revision history/rollback; common actions; CP3.7 follow-ups | FND, ACT, LOG, TERM, DEP, SAFE, QGA |
| **CP4b** | Remaining kinds: StatefulSets, DaemonSets, ReplicaSets, DeploymentConfigs/RCs, Jobs, CronJobs, HPAs, ConfigMaps/Secrets; Search by label | WL, JOB, CJ, HPA, CFG, SRCH, QGB |
| **CP4c** | Cluster OpenAPI capability (YAML schema sidebar + field help), "Edit Deployment" form, CP3.5 polish backlog | OAPI, HELP, FORM, POL, QGC |

## 2. Personas

- **Priya, on-call SRE (read-write grant on most clusters):** paged at 03:00; needs failing pod → logs → previous log
  → terminal → restart rollout in under a minute, and must be certain it is the right cluster.
- **Marco, platform engineer:** scales, pauses during maintenance, rolls back a bad revision, triggers a CronJob by hand,
  edits a ConfigMap.
- **Ines, auditor / read-only user:** reads logs and YAML on every cluster; must never be able to exec, delete, scale or
  edit, and must see *why* an action is unavailable.
- **Alice, read-only grant on production (`prod-k8s-1`, `prod-eu-1`):** read-write on staging, read-only on prod.

## 3. User stories

1. As Priya I want a Logs tab with follow, container select and previous log so that I can read a crash-looping pod's last words without `oc logs -p`.
2. As Priya I want a Terminal tab so that I can exec into a container from the browser without a kubeconfig for that cluster.
3. As Marco I want Edit Pod count, ring +/-, Restart rollout and Pause/Resume rollouts on Deployments so that day-2 changes take one click, as in OCP.
4. As Marco I want a ReplicaSets tab with revisions and Rollback so that I can undo a bad rollout.
5. As Marco I want Start Job and Suspend/Resume on CronJobs so that I can run a batch now or stop it during an incident.
6. As Priya I want Secrets masked until I reveal them so that values don't leak onto a shared screen.
7. As Priya I want to search all kinds by label so that I see everything belonging to `app=checkout` on this cluster at once.
8. As Ines I want blocked actions disabled with a reason so that I know it is my access, not a bug.
9. As anyone I want every mutation's confirmation and toast to name the cluster so that I never act on the wrong one.
10. As Marco I want the YAML editor to know the cluster's schema and the details page to explain fields so that I edit correctly without `oc explain`.

## 4. Acceptance criteria

Conventions: "RW" = user with a read-write grant and no global read-only flag; "RO" = read-only grant **or** globally
read-only user. "Access check" = the existing `useResourceAccess` SSAR path (cluster RBAC on the SA). "Mutation guard"
= the proxy MutationGuard policy (SECURITY.md). Exact type, endpoint and component names are the architects' call
unless quoted. All copy quoted below is OCP's unless marked *(fleet)*.

---

## CP4a — Pods and Deployments

### 4a.1 Foundations and CP3.7 follow-ups (FND)
- **FND-1** (first task) The dev mock and the AppHost dev seed contain a cluster `prod-k8s-1`: distribution Kubernetes, environment production, grant for alice **read-only**. In the mock UI it shows the `K8s` tag, the production label, the navy masthead and the production band.
- **FND-2** (F1) A switcher menu item showing type tag + environment label + "Read only" never truncates the display name below 12 characters at 1280 px (sidebar default width); a test renders `prod-k8s-1` with a long display name and all three labels and asserts the label group wraps under the name instead of squeezing it.
- **FND-3** (F2) ux-designer records a pass on the production band under the navy masthead in light and dark (contrast ≥ 3:1 for the band against the masthead, text ≥ 4.5:1), with clipped screenshots in the task file.
- **FND-4** (T-0154) After `npm run gen:api`, the FE alias `NamespaceRulesResult` and the `testResultBody` cast are removed; typecheck passes without them.
- **FND-5** Action `itemKey` `'edit-yaml'` is renamed `'edit'` (T-0135 nit); tests updated; no user-visible change.

### 4a.2 Common actions (ACT)
- **ACT-1** Every kind's kebab (row and details Actions menu) lists, in OCP order: kind-specific actions (below), then "Edit labels", "Edit annotations", "Edit `<Kind>`", "Delete `<Kind>`". Kinds OCP omits labels/annotations for are listed in the architects' design; default is all namespaced workload kinds.
- **ACT-2** "Edit labels" opens a modal titled "Edit labels" with a label input (PF `LabelGroup` editable / OCP `SelectorInput` look) prefilled with the object's labels; Save sends one JSON patch to `metadata/labels`; the modal names the object and the cluster *(fleet)*; on success the details page shows the new labels without a reload.
- **ACT-3** "Edit annotations" opens a key/value modal (OCP `AnnotationsModal`: rows of key + value, "Add more", remove row), Save patches `metadata/annotations`.
- **ACT-4** Given an RO user, every mutating action (ACT-2/3, Edit `<Kind>`, Delete, and all kind actions in this spec) is shown **aria-disabled** with a tooltip naming the cause: "Your access to `<cluster>` is read-only." (grant) / "Your account is read-only." (user flag) *(fleet; amended at CP4a accept)* for RO, the cluster RBAC reason for an access-check denial (existing behaviour). No mutating request is sent.
- **ACT-5** Given an RO user calls a mutating endpoint directly (e.g. via devtools), the proxy refuses it before forwarding (403 ProblemDetails, existing `Proxy.ReadOnly`), and an audit entry "denied" is written. Covered by an Api test per new verb used in CP4 (`PATCH`, `POST …/exec`, `POST` Job create, `DELETE`).
- **ACT-6** Every successful mutation in CP4 shows a success toast naming object and cluster, e.g. "web scaled to 3 on prod-eu-1" *(fleet)*; every failure shows an inline/danger alert with the cluster's `Status.message` (never a blank error).

### 4a.3 Pod logs (LOG)
- **LOG-1** Pod details has tabs in OCP order: Details, YAML, Logs, Events, Terminal (Metrics and Environment are out of scope, §6). The Logs tab URL is `…/pods/<name>/logs`, deep-linkable, with `?container=<c>` preserved.
- **LOG-2** The Logs toolbar mirrors OCP: container `Select` (with status per container, init containers listed under "Init containers"), "Log type" Current log / Previous log, "Search logs", "Wrap lines" checkbox, "Show full log" checkbox, actions "Download", "View raw logs" (opens the raw log in a new tab), "Expand"/"Collapse" (full screen), "Resume stream"/pause. *Amended at CP4a accept (T-0179, OCP main `resource-log.tsx`):* "Log type" is a Select; "Wrap lines"/"Show full log" are checkbox options of an "Options" settings Select (persisted); Download/View raw logs/Expand are plain icon buttons; Expand uses the Fullscreen API.
- **LOG-3** Given a running container, the tab opens following (`follow=true`) the last 1,000 lines (`tailLines=1000`); the status shows "Log streaming..."; new lines appear within 2 s of being written (fake apiserver test).
- **LOG-4** Scrolling up pauses the stream ("Log stream paused."); the button "Resume stream and show N new lines" catches up and scrolls to the bottom. The view keeps at most the 1,000-line buffer unless "Show full log" is checked (then no `tailLines`, still streamed, not buffered server-side).
- **LOG-5** "Previous log" requests `previous=true`; it is disabled with OCP's tooltip "Only the current log is available for this container." when `restartCount` is 0.
- **LOG-6** When the container terminates or the stream closes server-side, the status shows "Log stream ended." For an expected cut (proxy handler retirement after an admin cluster edit, watch/stream cap, network blip) while the container still runs, the viewer reconnects automatically within 5 s using `sinceTime` of the last received line (`timestamps=true` internally, stripped from display) and does not duplicate or drop lines in a fake-apiserver test that cuts the stream mid-way.
- **LOG-7** The backend never buffers log bodies: an Api test streams a 50 MiB log through the proxy with a bounded memory delta, and the first bytes reach the client before the upstream finishes (extends the CP2 streaming tests). The 30 s idle timeout does not cut a followed log that is quiet for 60 s.
- **LOG-8** "Download" saves `<pod>-<container>.log` with the full current (or previous) log, streamed to the file, not read into JS memory first beyond the browser's own download handling.
- **LOG-9** Logs are reads: RO users can use every LOG feature. No audit entry is written for log reads (SECURITY §Audit).
- **LOG-10** Empty/error states: container waiting → OCP's "Preparing log..." info; 403 from cluster RBAC → inline danger alert with the `Status.message`; pod deleted → "Log stream ended." plus the details page's not-found handling.

### 4a.4 Pod terminal (TERM)
- **TERM-1** The Terminal tab opens a WebSocket `exec` to the selected container with OCP's command `sh -i -c "TERM=xterm sh"`, subprotocol `base64.channel.k8s.io`, `stdin/stdout/stderr/tty=1`, rendered with xterm.js (PF-styled container, OCP `terminal.tsx` look: "Connecting to" + container `Select` above the terminal, "Expand" full screen).
- **TERM-2** Switching container closes the current session and opens a new one; navigating away closes the socket (no leaked sockets — test asserts close on unmount).
- **TERM-3** When the session ends (exit, server close, cap), the terminal shows OCP's inline info "The terminal connection has closed." with a "Reconnect" link; reconnect re-runs the access checks.
- **TERM-4** Given an RO user, the Terminal tab is present but shows an info empty state "You have read-only access to `<cluster>`. The terminal is not available." *(fleet)* and opens no socket; the proxy refuses an `exec` upgrade for RO (403, audited denied) — Api test.
- **TERM-5** Given RW but the SA lacks `create pods/exec` (access check), the tab shows the RBAC reason and opens no socket.
- **TERM-6** WebSocket upgrades require a matching `Origin` (existing); exec frames are relayed unbuffered in both directions (Api test with the fake apiserver echoing stdin, round-trip < 500 ms locally).
- **TERM-7** Each exec session writes an audit entry at session start (user, cluster, namespace, pod, container, verb `exec`, status 101) — it must not wait for the session to end *(security)*. Session end is recorded too (duration) if the architects' audit design allows; not required.
- **TERM-8** An exec session is capped (default 60 min, configurable, Q3) and also ends when the user's access is revoked or the cluster disabled at the next cap/reconnect; the cap message is TERM-3's.
- **TERM-9** Windows containers / no shell: when exec fails with a non-zero error-channel status the terminal prints the cluster's message (OCP behaviour), no crash.
- **TERM-10** Keyboard: the terminal traps focus only while focused; Escape-free exit via a visible "Expand"/"Collapse" button and Tab after clicking outside; documented in UX.md §12.

### 4a.5 Pod actions and list (DEP-1, DEP-2)
- **DEP-1** Pod kebab: "Edit labels", "Edit annotations", "Edit Pod", "Delete Pod" (OCP). Delete uses the existing cluster-naming `DeleteResourceModal`; on success from the details page the user lands on the Pods list of that namespace.
- **DEP-2** Pod list rows with status CrashLoopBackOff/Error link the status to the Logs tab of the failing container *(fleet, small improvement; OCP shows a popover)* — or the OCP status popover; architects pick whichever matches OCP's `PodStatus` better (Q6).

### 4a.6 Deployments: scale, rollout, history (DEP)
- **DEP-3** Deployment kebab in OCP order: "Edit Pod count", "Pause rollouts" / "Resume rollouts", "Restart rollout", "Edit update strategy", "Edit labels", "Edit annotations", "Edit Deployment", "Delete Deployment". ("Add HorizontalPodAutoscaler", "Add storage", "Edit resource limits" are out, §6.)
- **DEP-4** "Edit Pod count" opens OCP's count modal: title "Edit Pod count", text "Deployments maintain the desired number of healthy pods.", number input with −/+, "Save"/"Cancel"; Save sends a patch to the **`scale` subresource** (or `/spec/replicas` per OCP — architects: scale subresource preferred because its RBAC is narrower). The modal names the cluster *(fleet)*.
- **DEP-5** (T-0133 part) Deployment details show OCP's pod ring with "Increase the Pod count" / "Decrease the Pod count" buttons for RW users with `patch deployments/scale`; clicks are debounced into one scale request sent 1 s after the **last** click (trailing, flushed on unmount; ADR-0037 §7 — OCP fires on the first click and drops the rest); decrease is disabled at 0; without `patch deployments/scale` (incl. RO) the buttons are absent and the ring is read-only (OCP `isScalingAllowed`). Parity row "Deployment details" → `match`.
- **DEP-6** "Restart rollout" patches `spec.template.metadata.annotations["kubectl.kubernetes.io/restartedAt"]` with the current ISO time (kubectl/OCP semantics); disabled with tooltip "The deployment is paused and cannot be restarted." when `spec.paused`. No confirmation modal (OCP parity, Q2); toast names the cluster.
- **DEP-7** "Pause rollouts"/"Resume rollouts" toggles `spec.paused`; the details page shows OCP's paused alert ("… is paused …" with "Resume rollouts" link) while paused.
- **DEP-8** "Edit update strategy" opens OCP's modal (RollingUpdate with Max unavailable / Max surge, or Recreate); Save patches `spec.strategy`.
- **DEP-9** Deployment details gets the **ReplicaSets** tab (between YAML and Pods, OCP order) listing owned ReplicaSets with columns Name, Status ("`<status.replicas>` of `<spec.replicas>` pods", OCP RS page), Revision (`deployment.kubernetes.io/revision`), Created; newest revision first. No Pods column (OCP's tab has none; amended at CP4a accept, T-0185).
- **DEP-10** ReplicaSet kebab (on that tab and on the ReplicaSet page) offers "Rollback" only for a ReplicaSet owned by a Deployment that has no pods (`status.replicas` 0; OCP `replicaset-provider.ts`) — it is **hidden**, not disabled, while the ReplicaSet still has pods (incl. the active revision), and listed before the common items (ADR-0037 §3). It opens OCP's rollback modal ("Are you sure you want to rollback to **`<ReplicaSet>`**?", cluster named; the revision is in the success toast) and patches the Deployment's `spec.template` to the ReplicaSet's template (OCP `rollback-modal.tsx` semantics). Disabled while paused, as in OCP.
- **DEP-11** All DEP mutations: RO → ACT-4; proxy → ACT-5; success/failure → ACT-6; the list/details refresh via the existing watch without reload.

### 4a.7 Safety and security (SAFE)
- **SAFE-1** Every modal that mutates (count, strategy, rollback, labels, annotations, delete) shows the cluster's display name and environment label in its body or header; production clusters show the production label (existing DeleteResourceModal pattern).
- **SAFE-2** All CP4 mutations are forwarded with the user's grant SA token only; an Api test asserts the upstream `Authorization` is the grant token for PATCH, DELETE, POST and exec.
- **SAFE-3** Token-leak sweep (CRED-2 scanner) extended to log streams and exec handshakes: no token in responses, audit, or captured logs.
- **SAFE-4** The proxy's audit records PATCH/POST/DELETE/exec with readable action labels (POL-3 shares the label map), allowed and denied.

### 4a.8 Quality gates (QGA)
- **QGA-1** `scripts/check-be.sh` and `scripts/check-fe.sh` green; new Api tests for LOG-7, TERM-4/6/7, ACT-5, SAFE-2/3.
- **QGA-2** Playwright: (a) RW opens a pod's Logs, sees streamed lines, switches to Previous log; (b) RW scales a Deployment via modal and ring; (c) RO (alice on `prod-k8s-1` in the mock / prod in e2e) sees disabled actions and the Terminal RO state. Terminal e2e against the fake apiserver echo.
- **QGA-3** `docs/architecture/ocp-parity.md` gains rows Logs, Terminal, Count modal, Rollback, ReplicaSets tab — all `match` at accept.

### 4a.9 CP4a acceptance (2026-11-23, product owner) — **ACCEPTED**
All 4a criteria met on evidence: task files T-0155–T-0157, T-0170–T-0188 (all `done`, ACs ticked, reviews APPROVE),
Api tests `ProxyMutationVerbTests`/`ProxyLogStreamTests`/`ProxyKestrelTests`/`ProxyTokenLeakSweepTests` (ACT-5, LOG-7,
TERM-4/6/7/8, SAFE-2/3), e2e `web/e2e/workloads.e2e.ts` 11/11 with the T-0187/T-0188 fixmes removed, parity rows in
`docs/architecture/ocp-parity.md` (rows 39/59/63 refreshed at accept; all CP4a rows `match`). Amended at accept to what
was delivered and agreed: ACT-4 copy, LOG-2 toolbar shape, DEP-5 trailing 1 s debounce, DEP-9 no Pods column, DEP-10
hidden-while-pods. Other OCP-source deviations accepted as recorded in task handovers: OCP Rollback copy names the RS;
Terminal/RO states are EmptyStates; pod status popover (Q6) follows OCP `pod-list.tsx`; restart uses
`kubectl.kubernetes.io/restartedAt` (OCP uses `openshift.openshift.io/restartedAt`; kept for vanilla K8s clusters).
Non-blocking follow-ups for CP4b (`later`): e2e for Edit update strategy + pod status popover + LOG-6 auto-reconnect;
ui-probe of Terminal at 1280×800 and Update strategy modal; extract `TogglePlay` to `shared/ui`; eslint
`no-restricted-imports` for `@xterm/*`; skip the `name: ''` SSAR in `useReplicaSetActions`; honour `matchExpressions`
in owner selectors (Pods/ReplicaSets tabs); UX.md §2a band wording (T-0172); audit fixtures for `prod-k8s-1`; drop the
CONNECT/200 branch once T-0091 pins HTTP/1.1.

---

## CP4b — Remaining workload kinds, config and search

### 4b.1 Workload kinds (WL)
- **WL-1** The Workloads nav lists, in OCP order, the kinds the cluster serves (CP3.7 discovery): Pods, Deployments, DeploymentConfigs, StatefulSets, Secrets, ConfigMaps, CronJobs, Jobs, DaemonSets, ReplicaSets, ReplicationControllers, HorizontalPodAutoscalers. DeploymentConfigs appear only when `apps.openshift.io` is served.
- **WL-2** Each kind has an OCP-like list (columns from the OCP `*-list` component, e.g. StatefulSets: Name, Namespace, Status/Pods, Labels, Pod selector) and details with OCP's tabs (references header). Pods tabs use the existing `ResourcePodsTab`.
- **WL-3** StatefulSet: "Edit Pod count", ring scale (as DEP-4/5), "Restart rollout" (DEP-6 semantics), common actions.
- **WL-4** DaemonSet: "Restart rollout", common actions; details show Current/Desired scheduled counts.
- **WL-5** ReplicaSet / ReplicationController standalone: "Edit Pod count", common actions; owned-by-Deployment/DC ones show OCP's owner link.
- **WL-6** DeploymentConfig: "Start rollout" (POST `instantiate`, OCP `StartDCRollout`), "Pause rollouts"/"Resume rollouts", "Edit Pod count", ReplicationControllers tab with "Rollback"; details carry OCP's deprecation notice for DCs if OCP shows one for the cluster version.

### 4b.2 Jobs and CronJobs (JOB, CJ)
- **JOB-1** Job list/details (Details, YAML, Pods, Events); details show Completions, Parallelism, Active deadline, Succeeded/Failed/Active pods; "Edit parallelism" (count modal, OCP copy) + common actions.
- **CJ-1** CronJob tabs: Details, YAML, Pods, Jobs, Events (OCP order); details show Schedule, Concurrency policy, Starting deadline, Last schedule time, Suspend.
- **CJ-2** "Start Job" creates a Job from `spec.jobTemplate` with name `<cronjob>-<timestamp>`, the CronJob's annotations plus `cronjob.kubernetes.io/instantiate: manual`, and an ownerReference to the CronJob; on success navigates to the new Job (OCP); on failure a warning toast "Failed to start a Job." with the message.
- **CJ-3** "Suspend" / "Resume" *(fleet; OCP has no menu item, users edit YAML)* toggles `spec.suspend`; the list keeps OCP's Suspend (True/False) column and the details heading shows "Suspended" (amended at CP4b accept); RO/ACT rules apply.

### 4b.3 HPA (HPA)
- **HPA-1** HorizontalPodAutoscalers list (Name, Namespace, Labels, Scale target link, Min/Max pods) and details (Details, YAML, Events) with OCP's metrics table (current vs target); common actions. A Deployment/StatefulSet targeted by an HPA shows OCP's "Autoscaled" ring without arrows and hides "Edit Pod count" (OCP; amended at CP4b accept, was a count-modal warning).

### 4b.4 ConfigMaps and Secrets (CFG)
- **CFG-1** ConfigMap details show Data and Binary data sections (OCP `ConfigMapData`), each value copyable; "Edit ConfigMap" → YAML (form in CP4c only if cheap, else backlog).
- **CFG-2** Secret list (Name, Namespace, Type, Size, Created) and details (Details, YAML) with a Data section; values are masked by default; "Reveal values"/"Hide values" toggles all values on the page (OCP). Revealed state is not persisted (navigating away re-masks).
- **CFG-3** Reveal needs no confirmation modal (Q1); the masked state is the default on every load, and the YAML tab shows the base64 data as OCP does.
- **CFG-4** Secret values never appear in FleetConsole logs, traces, audit or toasts; an Api/FE test asserts the toast after editing a Secret names only the object and cluster.
- **CFG-5** RO users can reveal (it's a read their SA already performed) but every edit action is disabled per ACT-4.

### 4b.5 Search (SRCH)
- **SRCH-1** A "Search" page under Home (OCP) at `/c/<cluster>/search[/ns/<ns>]` with the project selector, a Resources multi-select (kinds the cluster serves that have a FleetConsole descriptor, typeahead; amended at CP4b accept), a Label filter (`key=value`, multiple, AND), a Name filter, chips and "Clear all filters".
- **SRCH-2** Results: one expandable section per selected kind, each a compact list (Name, Namespace, Labels, Created) using the kind's descriptor; empty kinds show "No `<kinds>` found"; nothing selected shows "No resources selected" / "Select one or more resources from the dropdown."
- **SRCH-3** State lives in the URL (`?kind=<ref>,<ref>&q=<label>&name=<n>`, OCP params) so a search is shareable and survives cluster switch where the kinds exist.
- **SRCH-4** Label chips on every list and details page now link to Search with that label and the current kind preselected (OCP); built by one shared path helper (T-0136 nit) with unit tests for encoding (`=`, `/`, `.` in keys).
- **SRCH-5** Requests are bounded: one list request per selected kind with `labelSelector` server-side, at most 6 in parallel, no N+1 per item.

### 4b.6 Quality gates (QGB)
- **QGB-1** Gates green; Api tests for Job create (CJ-2) RW/RO; e2e: Start Job → lands on Job; Search by label returns Deployment + Pods + Service sections; Secret masked by default.
- **QGB-2** Parity rows for every new list/details page `match` at accept.

### 4b.7 Task breakdown (frontend-architect, 2026-11-23)
Order and lanes (≤3 engineers at once; each task's `paths` are disjoint from its parallel lanes):
- **First:** T-0189 foundation (models, mocks, nav order WL-1, tab slots, minimal descriptors) ∥ T-0199 CP4a chores
  (shared `TogglePlay`, `@xterm/*` import rule).
- **Lane A (scale kit → workloads):** T-0190 shared scale/count/restart + HPA-aware ring → T-0191 StatefulSets/DaemonSets
  → T-0192 standalone RS/RC (+ `name: ''` SSAR fix) → T-0193 DeploymentConfigs.
- **Lane B (config → HPA → jobs):** T-0196 ConfigMaps/Secrets → T-0195 HPA pages → T-0194 Jobs/CronJobs (also needs T-0190).
- **Lane C (search):** T-0197 Search page → T-0198 label chips → Search.
- **Last:** T-0200 QA (QGB e2e, carried CP4a e2e, parity rows).

Design deviations (follow OCP source; accepted by the orchestrator 2026-11-23 per the UI north star, PO re-checks at ACCEPT): **HPA-1** — with an HPA the ring shows "Autoscaled" without
arrows and "Edit Pod count" is hidden (OCP), not a warning in the modal; **SRCH-1** — Resources lists kinds that have a
descriptor and are served, not every discovered kind (others have no pages yet); **WL-3/4** — Restart rollout on
StatefulSets/DaemonSets is a fleet addition (OCP has none); **WL-6** — the DC deprecation alert sits on the list page (OCP),
RC "Cancel rollout" is not in scope; HPA edit/remove actions on workloads (OCP dev-console) not in scope.
Deferred to CP4c POL: ui-probe of Terminal at 1280×800 and Update strategy modal (ux-designer); `matchExpressions` in owner
selectors; UX.md §2a band wording; drop the CONNECT/200 branch after T-0091 (BE); readable audit labels for
`instantiate`/`rollback` (with POL-3).
Backend asks (backend-architect): `ProxyMutationVerbTests` rows for POST `deploymentconfigs/<n>/instantiate` and
`…/rollback`, PUT deploymentconfigs, PATCH secrets; an Api test that Secret data never reaches audit/logs (CFG-4, extend
`ProxyTokenLeakSweepTests`). Job create RW/RO (QGB-1) is already covered.

### 4b.8 CP4b acceptance (2026-11-23, product owner) — **ACCEPTED**
All 4b criteria met on evidence: T-0189–T-0200 (all `done`, ACs ticked, reviews APPROVE); FE 1128/1128, BE 333+711+849,
e2e 29/29 (CP4b group 12/12 on `--repeat-each=2`, no `fixme`): Start Job → Job, Search `app=web` → Deployment/Pod/Service,
Secret masked + RO reveal (QGB-1); Job create RW/RO = `ProxyMutationVerbTests` `POST …/jobs`; CFG-4 =
`ProxyTokenLeakSweepTests` (T-0201); 13 CP4b rows in `docs/architecture/ocp-parity.md` (rows 69–81), each `match` with
recorded deviations (QGB-2). WL-1–6, JOB-1, CJ-1/2, HPA-1, CFG-1–5, SRCH-1–4 met. SRCH-5 **partially**: one list per
kind with server-side `labelSelector` is tested; the 6-request cap is `pLimit(6)` in `useSearchResults.ts`, untested.
Amended at accept to what was delivered: CJ-3 (OCP Suspend column kept, "Suspended" in heading), HPA-1 (Autoscaled ring,
Edit Pod count hidden), SRCH-1 (descriptor-backed kinds). Accepted deviations: Restart rollout on StatefulSets/DaemonSets
and CronJob Suspend/Resume are fleet additions; RC "Cancel rollout" deferred; the DC ReplicationControllers tab uses a
Revision column instead of OCP's Owner (consistent with the Deployment ReplicaSets tab; the owner is the page itself);
workload Pods tabs show Owner instead of OCP's Node (`showNodes`); Environment tab absent on all workloads (§6); modal-less
actions report errors in a toast instead of OCP's ErrorModal (project convention); DC "Learn more" shown on all clusters.
DEP-9/10 rewording from 4a.9 confirmed in place.
Follow-ups for CP4c POL (`later`): unit test that Search issues ≤6 concurrent list requests (SRCH-5); Node column on
workload Pods tabs (OCP `showNodes`, day-2 triage value); RC "Cancel rollout"; e2e for DC Start rollout + RC Rollback and
StatefulSet ring scale; readable audit labels for `instantiate`/`rollback`/`jobs` create (with POL-3); live OCP
side-by-side ui-probe of the CP4b pages (T-0200 verdicts are source-based); plus the §4b.7 deferrals (Terminal/strategy
ui-probe, `matchExpressions`, UX.md §2a, CONNECT/200). Backlog (ROADMAP): Environment tab for workloads; ErrorModal parity.

---

## CP4c — Schema, forms and polish

### 4c.1 Cluster OpenAPI capability (OAPI)
- **OAPI-1** The SPA loads the active cluster's OpenAPI v3 definitions through the proxy (`/openapi/v3` index + per-group documents, already on the proxy allow-list), lazily per group-version, cached per cluster in TanStack Query for the session; switching cluster never uses another cluster's schema.
- **OAPI-2** When the cluster or the SA refuses `/openapi` (403/404), the features degrade silently (no schema, no help), with one console-debug log, no user error.
- **OAPI-3** The YAML editor gets schema validation + completion + hover for the object's kind (Monaco YAML schema), and OCP's "View sidebar" schema sidebar (`public/components/sidebars/explore-type-sidebar.tsx`) with breadcrumbs into nested fields. Parity waiver W1 is closed (row → `match`).
- **OAPI-4** Large documents don't block the UI: parsing happens off the main thread or in under 100 ms per group-version on the core group (measured in a unit/bench test).

### 4c.2 Field help (HELP)
- **HELP-1** (T-0133 part) Details terms with an OpenAPI description render OCP's dashed-underline term with a popover (`DetailsItem` in `details-page.tsx`): field name, type, description. Applies to Pod and Deployment details at least, and every details page using the shared `DetailsItem`. Parity row "Details DescriptionList" → `match`.

### 4c.3 Edit forms (FORM)
- **FORM-1** "Edit Deployment" opens `…/deployments/<name>/form` with OCP's "Configure via:" Form view / YAML view toggle; the last choice is remembered (OCP uses a user setting).
- **FORM-2** Form view sections (OCP `DeploymentFormEditor`): Deployment strategy, Images (per container: image name), Environment Variables (key/value and from ConfigMap/Secret refs), Scaling (replicas), Pause rollouts ("Pause rollouts for this Deployment"), Advanced options (resource limits) — Advanced may be deferred (Q5).
- **FORM-3** Switching Form↔YAML keeps unsaved edits both ways; Save sends one `PUT`/patch with `resourceVersion`; a conflict shows OCP's "This object has been updated." with Reload; Cancel returns to details. RO → form read-only with ACT-4 reason.
- **FORM-4** All other kinds' "Edit `<Kind>`" opens their YAML tab (unchanged).

### 4c.4 Polish backlog (POL)
- **POL-1** T-0118 items 1–10 done (or each item explicitly re-filed by the architect with a reason).
- **POL-2** YAML tab: OCP's "Save" / "Reload" / "Cancel" buttons — Cancel returns to details (or discards when there is no previous page) with the existing unsaved-changes guard (CP3.5 backlog).
- **POL-3** Audit log shows readable action labels for proxy entries (e.g. "Scale Deployment", "Exec into Pod", "Delete Pod") instead of `proxy.update`; one shared map from (verb, subresource, kind) to label, unit-tested; raw id kept in a tooltip/detail.
- **POL-4** The admin "source" (how a user became admin) is served as a structured field from the API and `users/adminSource.ts` string parsing is removed (BE + gen:api).
- **POL-5** `Timestamp` and `DetailsSubsection` live in `web/src/shared/ui` with unit tests; `admin.test.tsx`'s local `openSidebar` moves to `web/src/test/sidebar.ts`.

### 4c.5 Quality gates (QGC)
- **QGC-1** Gates green; e2e: edit a Deployment image in Form view, switch to YAML, see the change, Save; YAML schema hover shows a field description.
- **QGC-2** `ocp-parity.md` has no `gap` rows left from CP3.6 waivers W1/W3/W4.

### 4c.6 Task breakdown (frontend-architect, 2026-11-24)
ADR-0038 (cluster OpenAPI v3: lazy per group-version, per-cluster TanStack cache, main-thread parse under a budget
test, `monaco-yaml`, one path resolver). Order and lanes (≤3 engineers at once; parallel lanes have disjoint `paths`):
- **Lane A (schema):** T-0210 OpenAPI data layer + mocks → T-0211 monaco-yaml validation/hover/completion → T-0212 YAML
  schema sidebar (W1) → T-0213 field-help popovers on every resource `DetailsItem` (W3; also waits for T-0214).
- **Lane B (form):** T-0214 Edit Deployment page (route `/form`, Configure via toggle, sync, Save/Reload/Cancel, RO,
  Advanced options = Pause rollouts + Scaling) → T-0215 Strategy + Images → T-0216 Environment Variables (+ form YAML
  schema, needs T-0211).
- **Lane C (polish):** T-0220 POL-3 audit labels → T-0219 RC Cancel rollout + SRCH-5 concurrency test → T-0221 POL-4 FE
  (after BE T-0232) → T-0217 Node column on DaemonSet/Job Pods tabs (after T-0213/T-0214) → T-0218 `matchExpressions`
  selectors (after T-0213/T-0214/T-0217 and ux T-0204).
- **Last:** T-0222 ux (Terminal/strategy-modal probe, live side-by-side of CP4b pages, UX.md §2a) after the ux shell
  tasks T-0203…T-0209 → T-0223 QA (QGC-1/2, carried CP4b e2e, POL evidence).

Decisions: **Q5** — Advanced options ship exactly as OCP's `AdvancedSection` (ProgressiveList: Pause rollouts + Scaling).
OCP's Edit Deployment form has no resource-limits section (that is OCP's separate "Edit resource limits" action, §6 out of
scope), so FORM-2's "Advanced options (resource limits)" is read as OCP's Advanced options; nothing is deferred.
**HELP-1** popover content follows OCP `DetailsItem` (label header, description, `Kind › path` breadcrumb, no type line).
**FORM-2 Images**: image name per container only; image-stream-tag source and auto-deploy triggers are omitted (no
ImageStream pages), recorded in the parity note. **POL-2** is already met by `ResourceYamlTab` (Save · Reload · Cancel
with guard · Download); QA records evidence. **POL-5** is met (shared `Timestamp`/`DetailsSubsection` with tests,
`test/sidebar.ts`); QA records evidence. **POL-1**: T-0118 items map to T-0119/T-0121/T-0122/T-0126; QA closes it per item.
W4 (ring scale) is already `match` (T-0184/T-0188); T-0133 is closed by T-0213. CONNECT/200 removal stays with T-0091 (BE).

### 4c.9 Acceptance (product owner, 2026-11-24) — **ACCEPTED**
Evidence: all CP4c tasks `done`; `check-fe.sh` green (1223 tests + build); e2e 37/37 incl. QGC-1/OAPI-3 in a real browser
(dev and the built `dist` under prod CSP, T-0239); BE gate green (T-0231); human login + pod-delete failover on consolinho (T-0233).
- **4c.1 OAPI — ACCEPTED.** OAPI-1/2/4 tested in T-0210 (per-cluster keys, 403/404 → one debug log, 2 MB parse < 100 ms).
  OAPI-3: hover/completion/validation live after T-0239; sidebar W1 `match` (T-0212, T-0222). **Decision:** "unknown field
  warns" is accepted as "wrong type on a known field is flagged". Cluster schemas carry no `additionalProperties: false`
  and OCP (`yaml-editor-utils.ts:configureMonacoYaml`, same schemas) doesn't warn on unknown fields either. Adding our own
  strictness would diverge from OCP.
- **4c.2 HELP — ACCEPTED.** T-0213 + T-0237 (links, line breaks); row 38 `match`. Live re-measure is pending (OCP was down) → T-0240.
- **4c.3 FORM — ACCEPTED.** FORM-1..4 by T-0214/15/16/38 + e2e form→YAML→Save, RO form. ImageStream source/triggers are
  omitted by decision (§4c.6), which is enough for fleet scope.
- **4c.4 POL — ACCEPTED.** POL-1..5 have evidence in the T-0223 work log. For POL-4 the hand-edited `schema.gen.ts` still needs a confirming `gen:api` run → T-0241 (not blocking; the tests cover the structured field).
- **4c.5 QGC — ACCEPTED.** Before tagging, the orchestrator fixes two doc items: tick the T-0223 QGC-1 box, and remove
  the stale "gap … T-0239" note from `ocp-parity.md` row 40 (fixed by T-0239).
- Later (ROADMAP backlog): hover "Source:" line vs OCP, shared linkify helper, shared `useResourceYamlSchema`,
  metadata-only Secret lists, DatabaseMigrator lock helper, keyring health check logged as Error on cold start.

## 5. UX notes

- **Tabs and URLs** follow OCP (`/logs`, `/terminal`, `/replicasets`, `/jobs`, `/form`). Tab order is OCP's minus tabs we don't ship (Metrics, Environment).
- **Logs page layout** (OCP `resource-log.tsx`): full-height `LogViewer`-like panel (PF `@patternfly/react-log-viewer` is the recommended library; OCP uses it) with toolbar above; status line left ("Log streaming..." with a spinner icon), line count, actions right in a kebab at narrow widths. Dark log background in both themes, as OCP.
- **Terminal**: black xterm area inside the tab body, toolbar row "Connecting to [container ▾]" and "Expand"; on close an inline PF `Alert` (info) above the terminal with "Reconnect".
- **Modals**: PF `Modal variant="small"`, OCP titles quoted above, primary "Save", secondary "Cancel"; body begins with the object and "in `<namespace>` on **`<cluster display name>`**" + environment label *(fleet)*.
- **Disabled actions**: PF `isAriaDisabled` + tooltip (existing pattern); never hidden for RO, so Ines learns the menu.
- **Ring**: PF donut-like OCP ring with the up/down chevron buttons to its right; aria-labels are OCP's copy.
- **Empty/error**: OCP `EmptyBox`/`ConsoleEmptyState` copy ("No `<kinds>` found"); RBAC errors inline with the cluster's message; never a full-page error for a tab failure.
- **Production**: no extra confirmations beyond OCP's (Q2); the production band and cluster-naming modals/toasts are the safety layer.

## 6. Out of scope (CP4)

Metrics tabs and pod/deployment graphs (no Prometheus integration); Environment tab (env editor) for Pods/Deployments
(the form's env section in CP4c is the only env editing); Debug container / "Debug in terminal"; `attach`; port-forward;
Cloud Shell / "Detach"; Add HorizontalPodAutoscaler / Add storage / Edit resource limits / Edit tolerations actions;
PodDisruptionBudgets; Topology view; Edit forms for kinds other than Deployment (and DeploymentConfig); Secret
create wizards (image pull / source / key-value); multi-pod aggregated logs; log search across pods; fleet-wide search
(backlog); bulk actions on many rows; change windows.

## 7. Open questions (with recommendation)

| # | Question | Recommendation |
|---|---|---|
| Q1 | ROADMAP says Secret "reveal with confirm"; OCP reveals without a modal. | **No modal** (CFG-3): the YAML tab already shows the data, so a confirm adds friction, not safety. Masked by default and not persisted is the real protection. PO decision; no human input needed unless they insist on the ROADMAP wording. |
| Q2 | Confirm Restart rollout / Pause / ring scale on production clusters? | **No** (OCP parity, muscle memory); cluster-naming toasts + production band. Revisit with the "change windows" backlog item. |
| Q3 | Exec session cap? | **60 min hard cap**, configurable; reconnect re-checks access (TERM-8). Mirrors the 300 s watch cap's purpose (bounded life for revoked users) without breaking real debugging. |
| Q4 | Logs over WebSocket (OCP) or streaming HTTP `fetch`? | **Streaming `fetch`** of `…/log?follow=true` (ReadableStream): same proxy path as other GETs, no Origin/upgrade path, RO-safe; architects may choose WebSocket if they find a concrete gap. Either way LOG-6/7 hold. |
| Q5 | Ship the Advanced (resource limits) section of the Deployment form in CP4c? | **Defer** to backlog unless the form framework makes it < 1 task; strategy, images, env, scaling, pause cover 90 % of edits. **Decided (§4c.6):** OCP's form has no resource limits; Advanced options = Pause rollouts + Scaling, as OCP. |
| Q6 | DEP-2: link failing status to Logs or OCP's status popover? | **OCP's popover** (with a "View logs" link inside) — parity first. |
| Q7 | Split CP4 into a/b/c with separate tags? | **Yes**, as §1; CP4a first. Each gets QA verify + PO accept; one merge to `main` at CP4c, or per sub-checkpoint if the orchestrator prefers smaller merges (recommended: merge per sub). |
| Q8 | DeploymentConfigs are deprecated in OCP 4.14+; still ship WL-6? | **Yes, minimal** (Start rollout, pause, scale, rollback): many of the 40 clusters still run DC-based apps. |

## 8. Proposed ROADMAP backlog additions (for the orchestrator to append)

- (CP4 spec) Environment tab (env editor) for Pods/Deployments/StatefulSets/DaemonSets, OCP `EnvironmentPage`.
- (CP4 spec) Debug container ("Debug in terminal" for CrashLoopBackOff pods) — OCP `debug-terminal.tsx`.
- (CP4 spec) Add HorizontalPodAutoscaler / Edit resource limits / Add storage actions.
- (CP4 spec) Multi-pod aggregated logs for a Deployment (label selector, interleaved by timestamp).
- (CP4 spec) Recent resources (last 10 opened objects per cluster) in the masthead / Home.
- (CP4 spec) Keyboard shortcuts: `l` logs, `t` terminal, `y` YAML on details pages.
- (CP4 spec) Secret create forms (key/value, image pull, source).
