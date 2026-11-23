# CP2 API contract — Kubernetes proxy and proxy audit

**Owner:** backend-architect · **Date:** 2026-11-20 · **Spec:** `CP2-proxy-and-resource-browser.md` · ADR-0019/0020/0021.
CP1 contract (`CP1-api-contract.md`) rules still apply (§1 global rules, CSRF, 401 handling). The proxy route is **not**
in the OpenAPI document (it is a passthrough); everything else here is, and FE regenerates types after T-0060.

## 1. Route

`ANY /api/clusters/{cluster}/k8s/{path}` → `{cluster.apiUrl}/{path}?{query}` (query unchanged except watch
`timeoutSeconds`, §3). Allowed `path` prefixes: `/api`, `/apis`, `/version`, `/openapi`, `/.well-known`. Encode
names as you would for the apiserver; never send `%2F`, `%2E`, `..`, `//` or backslashes (→ 400).

Examples: `GET /api/clusters/dev-1/k8s/api/v1/namespaces/shop/pods?limit=250`,
`PUT /api/clusters/dev-1/k8s/api/v1/namespaces/shop/configmaps/web` (body = object JSON),
`POST /api/clusters/dev-1/k8s/apis/authorization.k8s.io/v1/selfsubjectaccessreviews` (allowed for ReadOnly, not audited).

## 2. Headers

| Direction | Rule |
|---|---|
| Request | Mutations (any method but GET/HEAD/OPTIONS) need `X-Console-Request: 1` (else 403 `Auth.CsrfHeaderMissing`). Send `Accept`/`Content-Type` as for the apiserver (`application/json`, `application/merge-patch+json`, …). `Authorization`, `Cookie`, `Impersonate-*`, `X-Remote-*`, `X-Forwarded-*` are stripped; the cluster sees only the grant's SA token. |
| Response | Upstream headers pass through except `Set-Cookie` and `WWW-Authenticate`. |
| WebSocket (CP4) | `Origin` must equal the console's public origin, else 403 `Proxy.OriginNotAllowed`. |

## 3. Watches (Q5)

Plain HTTP chunked watch: `GET …/pods?watch=1&resourceVersion=<rv>&allowWatchBookmarks=true&timeoutSeconds=<≤300>`,
read with `fetch` + `ReadableStream` (newline-delimited `WatchEvent` JSON). The proxy caps/sets `timeoutSeconds` to
**300** (configurable), so every watch ends normally within 5 min; the client re-watches from the last seen
`resourceVersion` (that request is re-authorized — revocation takes effect). `410 Gone` (as an HTTP status or an
`ERROR` event with `code: 410`) → relist. Watches are never audited.

## 4. Errors raised by FleetConsole

FleetConsole errors are `application/problem+json` with `code`; show `detail` verbatim. **Any other error body is
the cluster's own** Kubernetes `Status` (`kind: "Status"`, `message`, `reason`, `code`) — e.g. 403 RBAC, 404, 409
conflict, 422 invalid — passed through unchanged.

| `code` | Status | When / `detail` |
|---|---|---|
| `Auth.Unauthenticated` | 401 | No/ended session (CP1). The **only** 401 the proxy returns → login. |
| `Auth.CsrfHeaderMissing` | 403 | Mutation without `X-Console-Request: 1`. |
| `Proxy.PathNotAllowed` | 400 | Path outside the allowlist or traversal/encoded separators. "This Kubernetes API path is not allowed through the console." |
| `Proxy.OriginNotAllowed` | 403 | WebSocket upgrade from a foreign `Origin`. |
| `Proxy.NotAvailable` | 404 | Unknown/disabled cluster, no grant, missing credential, deactivated user — identical body. "Cluster `<name>` is not available — it does not exist or you don't have access." (CP1 SW-5 wording) |
| `Proxy.UserReadOnly` | 403 | Globally read-only user, any mutation. "Your account is read-only." (checked first) |
| `Proxy.ReadOnlyGrant` | 403 | ReadOnly grant, any mutation. "Your access to `<cluster>` is read-only." |
| `Proxy.BodyTooLarge` | 413 | Mutation body > 10 MiB. "The request body is larger than the 10 MiB limit." |
| `Proxy.CredentialRejected` | 502 | Upstream answered 401. "The cluster rejected the credential assigned to you for `<cluster>`. Ask a Fleet administrator to rotate it." **Never log out on this.** |
| `Proxy.UpstreamUnavailable` | 502 | DNS/connection failure. "`<cluster>` is not reachable." |
| `Proxy.UpstreamTls` | 502 | TLS validation failed. "The TLS certificate of `<cluster>` could not be verified." |
| `Proxy.UpstreamTimeout` | 504 | No upstream activity for 30 s (non-streaming). "`<cluster>` did not respond in time." |

Check order: CSRF → 401 → 400 path → 403 origin → 404 → 403 `UserReadOnly` → 403 `ReadOnlyGrant` → 413 → forward.
Mutation = any method other than GET/HEAD/OPTIONS, plus any request to subresources `exec`, `attach`, `portforward`,
`proxy`; except `POST` to `selfsubjectaccessreviews`/`selfsubjectrulesreviews` (`authorization.k8s.io/v1`). No
`dryRun` exception.

## 5. Audit log additions (`GET /api/admin/audit`, CP1 §10)

- `AuditCategory` gains `proxy`; `AuditTargetType` gains `kubernetesResource`. `category=proxy&cluster=dev-1` filters work as before.
- Actions: `proxy.create` (POST), `proxy.update` (PUT), `proxy.patch`, `proxy.delete` (DELETE with name),
  `proxy.delete_collection`, `proxy.connect` (exec/attach/portforward/proxy), `proxy.other` (unusual methods).
- `actor` = user, `clusterName` = cluster, `targetName` = kubectl-style resource: `shop/configmaps/web`,
  `shop/deployments.apps/web/scale`, `namespaces/shop` (cluster-scoped), `shop/pods` (create/collection), or the path for
  non-resource requests. `summary` e.g. "sam updated shop/configmaps/web on dev-1 (200)" / "Denied: alice tried to
  delete shop/pods/web-1 on dev-1 (read-only grant)".
- `details`:
```json
{ "method": "PUT", "path": "/api/v1/namespaces/shop/configmaps/web", "group": "", "version": "v1",
  "resource": "configmaps", "subresource": null, "namespace": "shop", "name": "web",
  "dryRun": null, "fieldManager": null, "container": null, "statusCode": 200,
  "outcome": "allowed", "reason": null }
```
  `container` (ADR-0036 §5): the first `container` query value of a `proxy.connect` request (exec/attach), else
  `null`. The exec `command` is **never** recorded (users type secrets into it), nor is any other query parameter.
  `outcome`: `allowed` | `denied`. `reason` (denied only): `noAccess` | `userReadOnly` | `readOnlyGrant` | `bodyTooLarge`.
  `statusCode`: upstream status (401 recorded as 401 even though the browser got 502), 502/504 on forwarding
  errors, `0` if the client disconnected first, the problem's status for denials.
  Exec/attach (ADR-0036 §3): an accepted upgrade is audited **at the handshake**, before any frame is relayed, with the
  upstream status (`101`; `200` while upgrades may still travel as HTTP/2 extended CONNECT, T-0091). Nothing more is
  written when the session ends (that is a log line with its duration); a refused upgrade (e.g. the cluster's RBAC 403)
  is audited once with that status when the response completes.
  UI label: outcome `allowed` → status code; `denied` → "Denied — <reason>".

## 6. Unchanged

`GET /api/clusters` (CP1 §6) already gives `environment` and effective `accessMode` for UI-9 reasons 1–2 and SW-10.
Switcher recents (SW-8), last project (NS-2) and discovery (DATA-2) are client-side; discovery uses the proxy
(`GET …/k8s/api`, `…/k8s/apis`). No new BE endpoints.

## 7. Configuration keys (Api)

| Key | Default | Notes |
|---|---|---|
| `Proxy:RequestTimeout` | `00:00:30` | Idle timeout for non-streaming requests → 504. |
| `Proxy:WatchTimeoutCap` | `00:05:00` | Whole seconds, ≥ 1 s. Max `timeoutSeconds` for watches; also bounds revocation latency for open streams. |
| `Proxy:StreamIdleSlack` | `00:00:30` | ≥ 0. Added to `WatchTimeoutCap` to give the idle timeout and hard lifetime of non-upgrade streams (watches, followed logs), so a watch ends upstream before the proxy cuts it (ADR-0020, ADR-0036). |
| `Proxy:ExecSessionCap` | `01:00:00` | Whole seconds, ≥ 1 s. Hard lifetime and idle timeout of an upgraded stream (exec/attach WebSocket); at the cap the socket closes without a close frame (1006) and the reconnect is re-authorized (ADR-0036). Followed logs and other non-watch streams end at `WatchTimeoutCap` + `StreamIdleSlack` (body aborted). |
| `Proxy:MaxMutationBodyBytes` | `10485760` | > 0. |
