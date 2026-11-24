# 0035 — Access cache: FusionCache behind HybridCache, Redis L2 + backplane
**Status:** Accepted (2026-11-23, decided by the human; ROADMAP §CP4.5) · decision only, implemented in CP4.5 ·
builds on ADR-0019 (one authorization query per proxy request), ADR-0004 (token encryption); replaces the
"Adding a cache later" recipe in `BACKEND.md` · **amended by ADR-0040** (Application uses the `IQueryCache` port for
result-derived tags; no decrypted token is cached at all)

## Context
Every proxied request runs one authorization query (user, grant, credential, decrypted token; ADR-0019). With group
grants (ADR-0034), many replicas and watch-heavy UIs this becomes the hot path. We need a cache that is shared across
replicas, invalidated precisely, and never serves stale *authorization*.

## Decision
1. **API**: application code depends on `Microsoft.Extensions.Caching.Hybrid.HybridCache` only; the implementation is
   **FusionCache** registered as the `HybridCache` (memory **L1** + **Redis L2** + **Redis backplane** for L1
   invalidation across replicas).
2. **Tags** per `user:{id}`, `cluster:{id}`, `credential:{id}`, `group:{name}`. Invalidation runs from the **existing
   domain events after commit** (grant/user/cluster/credential events), in an event handler — not in handlers.
3. **Short TTL backstop** (order of a minute) so a missed invalidation heals by itself.
4. **Fail-safe off** for authorization entries: when the source can't be reached, the request fails rather than using an
   expired entry. (Fail-safe may be enabled for non-security entries such as discovery.)
5. **Secrets**: the decrypted token never leaves L1 (process memory). L2/Redis holds only the **encrypted** token
   (Data Protection ciphertext) and ids; decryption happens per replica.
6. **Redis** is added to the Aspire AppHost and to the OpenShift manifests (kustomize), with no persistence required.
7. Caching is a pipeline behavior / proxy policy concern (CLAUDE.md), never inside handlers.

## Consequences
- A new infrastructure dependency (Redis) in dev, tests (Testcontainers) and production manifests.
- Cache keys/tags and their invalidating events are listed in `BACKEND.md` §Recipes when implemented.
- A Redis outage degrades to L1 + database (FusionCache handles L2 failures), but authorization is never served stale.

## Alternatives rejected
- **Plain `HybridCache` default implementation**: no backplane, so a revoke on one replica leaves other replicas' L1
  entries stale until they expire.
- **Memory-only cache**: stale across replicas after a revoke.
