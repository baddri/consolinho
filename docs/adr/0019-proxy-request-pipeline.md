# 0019 — Proxy request pipeline: raw-path validation, one authorization query, ordered policies
**Status:** Accepted (2026-11-20) · refines ADR-0003 · CP2 spec §4.1–4.3, Q11

## Context
CP2 forwards every browser Kubernetes call through `/api/clusters/{cluster}/k8s/{**path}` (PRX-1). Before anything
reaches a cluster we must: reject unsafe paths (PRX-4), resolve the user's grant, credential and cluster (PRX-2/3), and
apply FleetConsole's own narrowing rules (MUT-1..5). These must stay a *policy chain* so new rules (change windows,
"no namespace deletes") are added without touching the endpoint (BACKEND.md recipe "Blocking a class of operations").
CLAUDE.md requires every use case to be a command or query.

## Decision
1. **Check order** (each step short-circuits; nothing is sent upstream on failure):
   CSRF middleware (403 `Auth.CsrfHeaderMissing`) → session (401 `Auth.Unauthenticated`) → path (400
   `Proxy.PathNotAllowed`) → WebSocket `Origin` (403 `Proxy.OriginNotAllowed`) → access (404 `Proxy.NotAvailable`) →
   policies in registration order: `MutationGuardPolicy` (403 `Proxy.UserReadOnly`, then 403 `Proxy.ReadOnlyGrant`),
   `RequestBodyLimitPolicy` (413 `Proxy.BodyTooLarge`).
2. **Path validation rejects, it never rewrites.** The forwarded path is the *raw* request target
   (`IHttpRequestFeature.RawTarget`) minus the `/api/clusters/{cluster}/k8s` prefix, so what we validated is byte for
   byte what the cluster sees (no decode/re-encode ambiguity). `ProxyPath.TryParse` rejects: empty path; any `%2e`,
   `%2f`, `%5c` (any case), `\`, `//`, `.`/`..` segments, control characters, a scheme or authority (`://`, leading
   `//`), and prefixes other than `/api`, `/apis`, `/version`, `/openapi`, `/.well-known` (segment match, case-
   sensitive like the apiserver). Other percent-escapes (e.g. `%3A` in names) pass through unchanged.
3. **`KubernetesRequestInfo`** (Application, pure) parses a validated path into group, version, resource,
   subresource, namespace, name and the Kubernetes verb, mirroring apiserver `RequestInfoFactory` for the subset we
   need: `/api/v1/...` (core) vs `/apis/<group>/<version>/...`, `namespaces/<ns>/<resource>`, the `namespaces/<ns>`
   object itself (+ its subresources `status`, `finalize`), legacy `/watch/` prefix, non-resource paths
   (`/version`, `/openapi/...`, discovery roots) → `IsResourceRequest = false`.
4. **Mutation classification (MUT-1, MUT-4)** — `ProxyRequestClassifier`:
   - any method other than GET/HEAD/OPTIONS is a mutation, except `POST` to `selfsubjectaccessreviews` /
     `selfsubjectrulesreviews` in `authorization.k8s.io/v1` (collection path, no name), which is a read;
   - any method on the subresources `exec`, `attach`, `portforward` **and `proxy`** (pods/services/nodes) is a
     mutation (verb `connect`). Including `proxy` is a deliberate tightening of MUT-1: apiserver proxying reaches
     arbitrary HTTP inside the cluster, which a ReadOnly grant must not do.
   - Watch = `watch=true|1` in the query or the legacy `/watch/` prefix. Streaming = watch, `follow=true`, or an
     `Upgrade` request.
5. **One authorization query.** `AuthorizeProxyRequestQuery(string ClusterName, ProxyRequest Request) :
   IQuery<ProxyTarget>, IRequireAuthenticated` loads grant ⋈ user ⋈ cluster ⋈ credential in **one SQL statement**
   (as `ListAccessibleClustersHandler` does), decrypts the token with `ITokenProtector`, builds `ProxyRequestContext`
   and runs `IEnumerable<IProxyPolicy>` in registration order. Not available (unknown/disabled cluster, no grant,
   deactivated user, missing credential, malformed cluster name) all yield the identical `Proxy.NotAvailable` error.
   Effective read-only = stored `user.IsReadOnly || ICurrentUser.IsReadOnly` (stricter wins, as in CP1).
6. **No access cache (Q11).** One indexed query per proxied request; PRX-3 revocation is immediate for new requests.
   Open watches end within `Proxy:WatchTimeoutCap` (ADR-0020) and re-authorize on reconnect. A cache is added later
   via the BACKEND.md recipe (post-commit invalidation), without touching handlers or the endpoint.
7. **Policies**: `IProxyPolicy { ValueTask<Result> EvaluateAsync(ProxyRequestContext context, CancellationToken ct); }`
   registered with `services.AddProxyPolicy<T>()` (scoped, order = registration order). Each policy has a table-driven
   unit test.
8. **Errors**: `ProxyErrors` (Application) holds the `Error`s; the Api's `ProxyProblems` writes them as ProblemDetails
   with the status from a code→status table (413/502/504 are not `ErrorType`s, and only the proxy needs them).
   FleetConsole-raised errors are `application/problem+json` with `code` starting `Proxy.`/`Auth.`; anything else
   came from the cluster (a Kubernetes `Status`) and is passed through untouched.
9. **WebSocket upgrades** (exec etc., UI in CP4) must carry an `Origin` equal to `Console:PublicOrigin`; the CSRF
   header can't be set on a browser WebSocket and Lax cookies are the only other defence.

## Consequences
- The endpoint is a thin adapter: validate path → dispatch query → forward → audit. New rules are policies.
- `ProxyPath`, `KubernetesRequestInfo` and the classifier are pure and covered by table tests (QG-2).
- Every proxied request costs one DB round trip and one Data Protection unprotect; acceptable for CP2 (Q11), cached in CP6.
- Rejecting (not normalising) odd paths may refuse a few exotic-but-legal names containing `%2F`; Kubernetes object
  names can't contain `/`, so nothing legitimate is lost.
