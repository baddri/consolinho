# 0041 — Fleet status: on-demand probes with the grant credential, one NDJSON stream, per-(cluster, credential) cache
**Status:** Accepted (2026-11-25, backend-architect; CP5c) · uses ADR-0020 (forwarding pool), ADR-0040 (`IQueryCache`,
tags) · new public API shape (streamed response) per CLAUDE.md rule 7

## Context
CP5c (spec §5c, FBE-1..7, Q4 accepted) needs one page with the health of every cluster the user may access: OpenShift
version/update state, ClusterOperator and Node counts, or a per-cluster error. Constraints: the user's own effective
grant credential, never FleetConsole's SA; ~40 clusters, some slow or dead; rows render as they arrive; bounded load on
the pod and on clusters; 30 s cache that never leaks across users; no persistence, no poller. Open points:
1. Delivery: per-cluster endpoint with client fan-out, or one streamed response?
2. Which HTTP client, and how to keep probes cheap on 500-node clusters?
3. Cache unit and key; how invalidation reaches it.
4. Where the health rules ("worst of …", FLT-4) live, given OVW-3 (frontend) must share them.
5. Proxy policies (FBE-2) and concurrency limits (FBE-3).

## Decision
1. **One streamed response: `GET /api/fleet/status`, `application/x-ndjson`**, one JSON object per line
   (`FleetClusterStatus`, contract `docs/specs/CP5-api-contract.md` §2), written and flushed in completion order; the
   stream ends when every cluster has a line. Pending rows come from the existing `GET /api/clusters` (same resolver,
   same set). Errors *before* the first byte are ProblemDetails as usual (401, 503 `Fleet.Busy`, 503 database);
   once streaming, every per-cluster problem is data in its line. The SPA already reads NDJSON (`web/src/shared/k8s/
   ndjson.ts`, watches/logs). The line schema is published in the OpenAPI document as the 200 response's
   `application/x-ndjson` schema, so `npm run gen:api` types it.
2. **Probes go through the proxy's per-cluster forwarding pool** (`IClusterForwardingClients`, same TLS/CA trust,
   pooled connections) behind a new read-only port `IClusterHealthReader` (Infrastructure `ClusterHealthReader`), not
   the connection-test client (a fresh handler and TLS handshake per session × 40 clusters × users). Probes: OpenShift
   — `GET clusterversions/version`, `GET clusteroperators` and `GET nodes` **as server-side Tables**
   (`Accept: application/json;as=Table;v=v1;g=meta.k8s.io`, `includeObject=None`: Node objects carry image lists,
   tens of KB each); Kubernetes — `GET /version` + nodes Table. The declared distribution picks the set. Responses are
   capped (4 MiB) and reduced to counts in the adapter; nothing raw leaves it.
3. **Cache unit = probe facts per (cluster, credential)**, key `fleet-health:v1:cluster:{clusterId}:credential:
   {credentialId}`, tags `cluster:{id}` + `credential:{id}`, through `IQueryCache` with a per-call duration
   (`Fleet:CacheDuration`, default 30 s; `IQueryCache.GetOrLoadAsync` gains an optional `duration`). The data a probe
   sees is a function of the token alone, so keying by credential is exactly as wide as the proxy would allow: users
   sharing a credential share one probe (50 users of a group grant → 1 upstream call per cluster per 30 s), users with
   another credential (RO vs RW, other group) never read it. Access is resolved **per request** from the cached access
   snapshot (one SQL per miss, FBE-2), so grant changes need no fleet invalidation; `ClusterUpdated/Disabled/Deleted`
   and `CredentialRotated/Deleted` already remove these tags (`AccessCacheInvalidation`). Outcomes such as
   "unreachable" **are cached** (they are data, not `Result` failures) — that is what stops 50 users from each waiting
   5 s on a dead cluster. The identity/access-mode part of a line is never cached. No token, no upstream text in it.
   This fan-out cache is a dedicated Application service (`ClusterHealthProbe`) calling `IQueryCache` directly, not an
   `ICacheableQuery` dispatched per cluster: N concurrent dispatches on one request scope would share scoped services
   (`ICurrentUser`, behaviors) across threads. Documented exception to the BACKEND.md caching recipe.
4. **The backend returns facts, the frontend derives status.** Lines carry normalized facts (versions, condition
   flags, counts, per-probe outcome `ok|forbidden|notFound`, cluster-level `failure`) — mechanical reductions, no health
   judgement. FLT-4's "worst wins" rules are implemented **once**, in TypeScript, shared by OVW-3 (which normalizes raw
   ClusterVersion/ClusterOperator/Node objects into the same facts) and the fleet page. The contract documents the rules
   table for both architects.
5. **Bounds and policies.**
   - Per request: at most `Fleet:MaxClusterConcurrency` (default 10) clusters probed at once (`Parallel.ForEachAsync`
     into a `Channel`); the cluster's probes run together under one budget `Fleet:ClusterTimeout` (default 5 s,
     linked to `RequestAborted`); client disconnect cancels everything in flight.
   - Per pod: ASP.NET Core rate limiter, global concurrency limiter `fleet-status` (`Fleet:MaxConcurrentRequests` 16,
     `Fleet:RequestQueueLimit` 64), rejection → 503 ProblemDetails `Fleet.Busy` + `Retry-After: 5`. Built-in, no
     hand-rolled semaphore; placed after `UseAuthorization` so anonymous calls get 401 first.
   - The `IProxyPolicy` chain runs per cluster for each probe's `GET` (`ProxyRequest.Create`) **before** the cache
     lookup; a refusal skips the cluster (no upstream call, nothing cached) with `failure: blockedByPolicy`. Today's
     policies never refuse a GET; the hook keeps a future read policy (maintenance window, environment rule) honest.
   - Per-cluster isolation: an unexpected exception in one cluster's probe is logged (Error) and becomes
     `failure: upstreamError` for that line; cancellation is never swallowed.
6. **Observability (FBE-6):** on each cache miss one structured log (Debug for ok, Information otherwise: cluster id,
   outcome category, elapsed ms — never the token, URL query or body) and one histogram
   `fleetconsole.fleet.probe.duration` (tag `outcome`) on a new `Meter` `FleetConsole.Application` registered in the
   Api's OpenTelemetry metrics. No audit entry (reads).

## Consequences
- New config section `Fleet:*` (validated at start like `Proxy:*`); new public route `/api/fleet/status`.
- The fleet page shows data up to `CacheDuration` old ("Last checked" = `checkedAt`); "Refresh" within that window
  returns cached lines. Auto-refresh (60 s) always gets fresh data.
- Clusters answering 4xx/5xx to Table requests (non-conformant servers) show `upstreamError`; the e2e and Api test
  fakes must answer Table requests for nodes/clusteroperators.
- Worst-case upstream load per pod: 16 computations × 10 clusters × 3 probes, usually far less thanks to the shared
  cache.

## Alternatives rejected
- **Per-cluster endpoint, client fan-out:** simplest server, but 40 requests share the browser's 6 HTTP/1.1
  connections (OpenShift routes default to HTTP/1.1) with the switcher and watches; slow clusters starve the page and
  the server can't bound per-page parallelism.
- **SSE (`text/event-stream`):** `EventSource` auto-reconnects (re-running 40 probes) and adds framing we don't need;
  the SPA already parses NDJSON with `fetch`.
- **Background poller with FleetConsole's SA:** rejected by the PO (Q4): needs a privileged SA per cluster and shows
  data grants may not cover.
- **Full objects (`application/json`) for nodes:** megabytes per large cluster per 30 s.
- **Status computed on the server:** a second copy of OVW-3's rules in C#, guaranteed to drift.
