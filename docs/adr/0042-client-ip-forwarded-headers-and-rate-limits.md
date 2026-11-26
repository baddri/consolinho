# 0042 — Client IP from trusted forwarded headers; login and proxy-mutation rate limits
**Status:** Accepted (2026-11-26, backend-architect; CP6a, spec Q4/Q6 provisionally accepted) · amends ADR-0028 §3
(forwarded headers), extends ADR-0021/0008 (audit gains `clientIp`), keeps ADR-0041 §5 (fleet-status limiter)

## Context
CP6a (spec §6a.2–6a.3, RL-1..4, FWD-1..3) needs the real client IP for audit and per-IP login limits. ADR-0028 §3
deliberately trusted no forwarded headers; the app sits behind the OpenShift Route (HAProxy), which appends
`X-Forwarded-For`. Only fleet status is limited today (one global `ConcurrencyLimiter`). Login start and the OAuth
callback are anonymous and cheap to hammer; proxy mutations are the only proxy traffic that can harm a cluster quickly.
The OAuth callback is answered by the OAuth handler inside `UseAuthentication`, i.e. it is **not an endpoint**, so
endpoint rate-limit policies cannot reach it.

## Decision
1. **Forwarded headers.** `UseForwardedHeaders` first in the pipeline (before the exception handler), options from
   `ForwardedHeaders:KnownNetworks` (CIDR list) and `ForwardedHeaders:KnownProxies` (IP list); headers
   `XForwardedFor | XForwardedProto`, `ForwardLimit = 1` (take only the hop the router appended, so a client-supplied
   XFF prefix is ignored). Empty lists = trust nobody (the ADR-0028 behaviour); the loopback defaults of ASP.NET are
   cleared, never "trust all". Manifests set the cluster/pod network CIDR (+ machine network when routers run on the
   host network; `deploy-dev.sh` derives both live from `network.config/cluster`). Validated on start (each entry
   parses, else one Critical line naming the key).
2. **Header policy unchanged upstream.** The middleware moves originals to `X-Original-For/-Proto`; the proxy
   transformer strips `X-Original-*` too, so nothing forwarded-related reaches a cluster (FWD-3).
3. **Client IP in audit.** Port `IClientAddress` (Application/Abstractions, `string? ClientIp`), implemented in the Api
   from `HttpContext.Connection.RemoteIpAddress` (IPv4-mapped IPv6 unmapped; null outside a request). `AuditTrail` is the
   only reader; `AuditEntry` gains nullable `ClientIp` (≤ 45 chars, column `client_ip`), the audit API exposes
   `clientIp: string | null`. Old rows stay null.
4. **Login limit (RL-1)**: a small middleware `AuthRateLimitMiddleware` placed **before `UseAuthentication`**, applied
   only to `GET /api/auth/login` and `/api/auth/callback`, partitioned by client IP, `FixedWindowRateLimiter`
   (`RateLimiting:Login:PermitLimit` 20, `:Window` 1 min, queue 0). Rejection: 429 ProblemDetails `Auth.RateLimited`
   + `Retry-After` (seconds to window end), and one `auth.rate_limited` audit entry per IP per window per pod.
5. **Proxy-mutation limit (RL-2)**: endpoint policy `proxy-mutations` on the proxy route in the existing
   `UseRateLimiter` (after authorization), partitioned by session user id, `TokenBucketRateLimiter`
   (`RateLimiting:ProxyMutations:TokenLimit` 30, `:TokensPerPeriod` 30, `:ReplenishmentPeriod` 10 s, queue 0).
   The partitioner classifies with the endpoint's own parse (`KubernetesProxyEndpoint.TryClassify` → `ProxyRequest`);
   anything not `IsMutation` (reads, watches, log streams, SSAR/SSRR) or unparsable gets `GetNoLimiter`.
   Rejection: 429 `Proxy.RateLimited` + `Retry-After`, nothing forwarded; a metric and one Warning log line per user per
   window, **no audit entry** (nothing reached the cluster; SECURITY.md § Audit says so).
6. **Per pod.** Limits are in-memory per replica (≥ 3 replicas ⇒ the effective cluster-wide limit is up to N×). Accepted:
   the goal is abuse damping, not quotas; no Redis-backed limiter.

## Consequences
- `RateLimiting:*` and `ForwardedHeaders:*` are new configuration (RUNBOOK §5, tuning section). All limiter policies are
  listed in `BACKEND.md` § Rate limiting.
- If an external load balancer in front of the router hides client IPs, all logins share one partition; RUNBOOK says to
  raise the limit or enable PROXY protocol on the ingress controller.

## Alternatives rejected
- **ASP.NET global limiter for login**: would also run for every request and still cannot sit before authentication
  without moving `UseRateLimiter`, which would make anonymous fleet requests consume permits (ADR-0041 §5).
- **Proxy limit as an `IProxyPolicy`**: policies run after the authorize query and return `Result`s without headers;
  a limiter in front is cheaper and owns `Retry-After`.
- **Trust all proxies** / `ForwardLimit = null`: lets any client forge its audit IP and dodge the login limit.
