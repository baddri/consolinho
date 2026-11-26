# 0044 — Server-side discovery cache in the proxy, keyed by cluster + credential
**Status:** Accepted (2026-11-26, backend-architect; CP6a, spec Q1 provisionally accepted) · amends ADR-0020 (one
cached path family on the otherwise unbuffered proxy), uses ADR-0040 (`IQueryCache`/FusionCache tags, backplane)

## Context
DC-1..5: `GET /api`, `/apis` (legacy and aggregated v2) and `/version` are fetched by every user on every cluster at
first load. Discovery can differ by credential (RBAC-filtered aggregated APIs), so entries may never be shared across
credentials. The proxy must stay streaming for everything else; error mapping (401 → 502, TLS, timeouts) lives in the
YARP path and must not be duplicated.

## Decision
1. **What:** only `GET` (not HEAD/upgrade) on the exact paths `/api`, `/apis`, `/version` (no sub-paths, no query) —
   `ProxyPath.IsDiscovery`. Runs **after** the authorize query and policies (DC-1), so grant revoke, user deactivation
   and cluster disable are enforced before any lookup; entries hold no user data.
2. **Key:** `discovery:v1:cluster:{id}:credential:{id}:{path}:{sha256(normalised Accept + "\n" + Accept-Encoding)[..16]}`
   — `Vary: Accept` is honoured by keying on the request header; the v2 aggregated and legacy forms are separate entries.
   `ProxyTarget` gains `CredentialId` (the winning grant's credential).
3. **Fill on the normal path:** on a miss the request is forwarded by YARP unchanged; the response body is teed into a
   bounded buffer (`Proxy:DiscoveryCacheMaxBytes`, default 4 MiB). Stored only when status is 2xx, the forward completed
   without error and the buffer did not overflow (DC-2). Stored value: status, `Content-Type`, `Content-Encoding`,
   body bytes. A hit writes exactly those plus the proxy's normal response headers — byte-identical body (DC-4).
4. **Store:** port `IDiscoveryResponseCache` (Application/Abstractions/Caching) implemented over the shared FusionCache
   instance, **memory only** (skip the Redis L2: bodies can be ~1 MB × 40 clusters × credentials), tags
   `cluster:{id}` + `credential:{id}` so existing `AccessCacheInvalidation` handlers (rotation, cluster edit/delete,
   credential delete) invalidate it on every replica via the backplane (DC-3). TTL `Proxy:DiscoveryCacheSeconds`
   (default 60, 0 disables, max 600).
5. Metric `fleetconsole.proxy.discovery_cache{cluster, result=hit|miss|bypass}` (DC-5, ADR-0043 labels).

## Consequences
- Discovery hits never reach the cluster for up to 60 s after a CRD install; the SPA's 5-min re-check (DR-5) and the TTL
  bound that. Revocation needs no cache work (authz precedes lookup).
- The tee is the only buffering on the proxy route; it is limited to three exact paths and a size cap.

## Alternatives rejected
- **Shared per cluster** (Q1): could reveal served APIs a credential cannot see.
- **Separate `HttpClient` call for discovery**: duplicates YARP's header policy and error mapping.
- **Redis L2 for bodies**: memory pressure on Redis for data that is cheap to refetch.
