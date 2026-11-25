# CP5 — API contract (fleet status; CP5a/b need no new endpoints)

Owner: backend-architect. Consumers: frontend-architect (CP5c fleet page, OVW-3 shared rules). The Api's OpenAPI
document is the final source; the FE regenerates types (`npm run gen:api`). JSON is camelCase, enums camelCase strings.
Errors before streaming are RFC 9457 ProblemDetails with `code`. Spec: `CP5-networking-storage-compute.md` §5c.
Decision: ADR-0041.

## 1. CP5a / CP5b: proxy only
Every CP5a/CP5b read and mutation goes through the existing proxy `/api/clusters/{cluster}/k8s/...` (CP2 contract):
PVC expand = `PATCH .../persistentvolumeclaims/{name}` (merge or JSON patch), Create Project = `POST
/apis/project.openshift.io/v1/projectrequests`, Mark as (un)schedulable = `PATCH /api/v1/nodes/{name}`. All are
mutations → refused for RO grants / read-only users with 403 `Proxy.ReadOnlyGrant` / `Proxy.UserReadOnly` before
forwarding, audited like CP4 verbs (SAFE5-2/3; Api tests T-0324). Nothing new to generate.

## 2. `GET /api/fleet/status` (FBE-1..7)
Any signed-in, active user (no role). Returns **200 `application/x-ndjson`**: one `FleetClusterStatus` JSON object
per line, `\n`-terminated, flushed as each cluster completes (completion order, not sorted). Exactly one line per
cluster the user has effective access to (same set as `GET /api/clusters`, disabled clusters excluded); a user with no
access gets 200 with an empty body. The stream ends when every cluster has its line (worst case ≈ clusters /
concurrency × `Fleet:ClusterTimeout`). Aborting the fetch cancels all probes.

| Status | When | `code` |
|---|---|---|
| 200 | always once streaming starts; per-cluster problems are in the lines | — |
| 401 | no session / deactivated user | (existing) |
| 503 | pod already runs `Fleet:MaxConcurrentRequests` computations and the queue is full; `Retry-After: 5` | `Fleet.Busy` |
| 503 | database unavailable while resolving access (CACHE-5, existing) | `Persistence.Unavailable` |

Response headers: `Cache-Control: no-store`. No CSRF header needed (GET).

```ts
// One NDJSON line. Sections are null when not probed (Kubernetes has no clusterVersion/clusterOperators;
// every section is null when `failure` is set).
interface FleetClusterStatus {
  cluster: AccessibleCluster;             // existing schema: name, displayName, environment, distribution, accessMode, webConsoleUrl
  checkedAt: string;                      // ISO 8601, when the facts were probed (cache time) → "Last checked"
  failure: FleetClusterFailure | null;    // cluster-level: the cluster could not be read at all
  kubernetesVersion: FleetKubernetesVersion | null;   // Kubernetes clusters only (GET /version)
  clusterVersion: FleetClusterVersion | null;         // OpenShift only
  clusterOperators: FleetClusterOperators | null;     // OpenShift only
  nodes: FleetNodes | null;                           // both
}

type FleetClusterFailure =
  | "unreachable"     // DNS, connection refused/reset, network unreachable
  | "timeout"         // the cluster's probes did not finish within Fleet:ClusterTimeout (default 5 s)
  | "tlsError"        // TLS handshake / certificate failure (CA bundle, expiry, host name)
  | "tokenInvalid"    // 401 from the API server: the grant's SA token is expired/revoked
  | "upstreamError"   // 5xx/429, non-Kubernetes answer, oversized response, or an internal probe error
  | "blockedByPolicy";// a FleetConsole proxy policy refuses this user's read on this cluster (never today)

type FleetProbeOutcome = "ok" | "forbidden" | "notFound";   // forbidden = 403 for this resource → "Restricted" cell

interface FleetKubernetesVersion { outcome: FleetProbeOutcome; gitVersion: string | null; }   // e.g. "v1.31.4"

interface FleetClusterVersion {
  outcome: FleetProbeOutcome;
  currentVersion: string | null;   // newest status.history entry with state Completed; else status.desired.version
  desiredVersion: string | null;   // status.desired.version ("Updating to <v>")
  available: boolean | null;       // condition Available == True (null when the condition is absent)
  progressing: boolean | null;     // condition Progressing == True
  failing: boolean | null;         // condition Failing == True
  availableUpdates: number | null; // status.availableUpdates length (0 when null/absent)
}

interface FleetClusterOperators {
  outcome: FleetProbeOutcome;
  total: number | null;
  degraded: number | null;      // Degraded == True
  unavailable: number | null;   // Available != True (False, Unknown or missing)
  progressing: number | null;   // Progressing == True
}

interface FleetNodes {
  outcome: FleetProbeOutcome;
  total: number | null;
  ready: number | null;          // Ready condition True
  notReady: number | null;       // total − ready (False or Unknown)
  unschedulable: number | null;  // spec.unschedulable (Table: "SchedulingDisabled")
}
```
Counts are null exactly when `outcome != "ok"`. A section with `outcome: "notFound"` on an OpenShift-declared cluster
renders "—" (e.g. ClusterVersion missing). No upstream message text is ever included (FBE-6).

### 2.1 Health rules (FLT-4, shared with OVW-3) — implemented once, in the frontend
First matching row wins (= FLT-5 severity order). OVW-3 feeds the same function with facts normalized from raw objects.

| Status | Rule |
|---|---|
| Unreachable | `failure` ∈ {unreachable, timeout, tlsError, upstreamError} |
| Token invalid | `failure == tokenInvalid` |
| Degraded | `clusterVersion.failing` ∨ `clusterOperators.degraded > 0` ∨ `clusterOperators.unavailable > 0` ∨ `nodes.notReady > 0` |
| Updating | `clusterVersion.progressing` |
| Restricted | `failure == blockedByPolicy` ∨ any section with `outcome == "forbidden"` (tooltip names it: ClusterVersion / ClusterOperators / Nodes / version) |
| Healthy | otherwise |

Cells (FLT-3): Version = `clusterVersion.currentVersion` ?? `kubernetesVersion.gitVersion`; Update = failing →
"Failing", progressing → "Updating to `desiredVersion`", `availableUpdates > 0` → "Update available", else "Up to
date" ("—" when `clusterVersion` is null). Operators / Nodes from the counts.

### 2.2 Consuming it (FE notes)
- Render pending rows ("Checking…") from `GET /api/clusters`; replace by `cluster.name` as lines arrive; at stream
  end drop rows that got no line (access changed between the two calls).
- Read with `fetch` + `ndjsonLines()` (`web/src/shared/k8s/ndjson.ts`); pass an `AbortSignal` (unmount, refresh).
- Lines are cached server-side per (cluster, credential) for `Fleet:CacheDuration` (30 s): "Refresh" inside that window
  returns the same `checkedAt`.
- The e2e fake apiserver must answer `GET /api/v1/nodes` and `GET /apis/config.openshift.io/v1/clusteroperators`
  with `Accept: application/json;as=Table;v=v1;g=meta.k8s.io` as a `meta.k8s.io/v1` `Table` (see §3), and
  `GET /apis/config.openshift.io/v1/clusterversions/version` as JSON.

## 3. Upstream requests the server makes (for fakes and reviewers)
All with `Authorization: Bearer <user's winning grant token>` through the proxy's forwarding pool.

| Distribution | Request | Accept | Reads |
|---|---|---|---|
| OpenShift | `GET /apis/config.openshift.io/v1/clusterversions/version` | `application/json` | `status.desired.version`, `status.history[].{state,version}`, `status.conditions[]`, `status.availableUpdates` |
| OpenShift | `GET /apis/config.openshift.io/v1/clusteroperators?includeObject=None` | Table | columns `Available`, `Progressing`, `Degraded` (`True`/`False`/`Unknown`/empty) |
| both | `GET /api/v1/nodes?includeObject=None` | Table | column `Status`: comma list, first item `Ready` / `NotReady` / `Unknown`, may contain `SchedulingDisabled` |
| Kubernetes | `GET /version` | `application/json` | `gitVersion` |

Table = `application/json;as=Table;v=v1;g=meta.k8s.io`; columns are located by `columnDefinitions[].name`
(case-insensitive), never by index. A Table without the needed column → `upstreamError`.
