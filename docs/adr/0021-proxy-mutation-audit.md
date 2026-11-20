# 0021 — Proxy mutation audit: written after the response, in its own unit of work
**Status:** Accepted (2026-11-20) · refines ADR-0008 · CP2 spec PAUD-1..4, Q10

## Context
ADR-0008 writes audit entries in the same transaction as the aggregate change. A proxied mutation changes no
FleetConsole aggregate: the "change" happens in a cluster, and its outcome (upstream status) is known only after
forwarding. Denied mutations must be audited too, and an audit failure must never block the response (PAUD-3).

## Decision
1. **Command**: `RecordProxyAuditCommand(ProxyAuditRecord Record) : ICommand, IRequireAuthenticated` — deliberately
   **not** `IMutatingCommand` (a read-only user's denied attempt must be recorded). The handler calls
   `IAuditTrail.Record(...)` and returns success; `UnitOfWorkBehavior` saves (the BACKEND.md recipe for actions that
   change no aggregate).
2. **When**: the endpoint dispatches it once per mutation (per ADR-0019 classification; SSAR/SSRR reviews and reads
   are never audited) after the outcome is known: on denial (404 `NoAccess`, 403, 413) before writing the problem,
   and after `IHttpForwarder.SendAsync` returns for forwarded requests. It uses `CancellationToken.None` (the client may
   have disconnected) and is wrapped in `try/catch` that logs at **Error** (EventId 2400) and swallows.
   Unauthenticated, CSRF-rejected and path-rejected requests are not audited (no actor / no parsed resource).
3. **Status recorded**: the upstream status code if the cluster answered (also 401, though the client got 502);
   502/504 for forwarding errors; `0` when the client disconnected before an upstream status existed.
4. **Shape** (contract `docs/specs/CP2-api-contract.md` §5): category `proxy` (new `AuditCategory.Proxy`, prefix
   `proxy`), target type `kubernetesResource` (new), action `proxy.<verb>` with verb ∈ `create`, `update`, `patch`,
   `delete`, `delete_collection`, `connect`, `other`. `clusterName` = route cluster when it is a valid `ClusterName`
   (else null). `targetName` = kubectl-style `[<ns>/]<resource>[.<group>][/<name>][/<subresource>]`, or the path for
   non-resource requests. `details` = method, path (no query), group, version, resource, subresource, namespace, name,
   dryRun, fieldManager, statusCode, outcome (`allowed`|`denied`), reason (`noAccess`|`userReadOnly`|
   `readOnlyGrant`|`bodyTooLarge`|null). Never bodies, headers or the query string beyond `dryRun`/`fieldManager`.
5. Enum values are appended (`Proxy = 5`, `KubernetesResource = 5`); stored as integers, so no migration.

## Consequences
- An allowed mutation whose audit write fails is *not* rolled back (it already happened on the cluster); the Error log
  is the signal. This is weaker than ADR-0008's guarantee and accepted: the alternative (write-ahead "attempted"
  entry + update) doubles writes and breaks append-only.
- Long-lived `connect` sessions (CP4 exec) are audited when they end; CP4 may add a start entry.
- GETs/watches are visible only in OpenTelemetry traces (Q10).
