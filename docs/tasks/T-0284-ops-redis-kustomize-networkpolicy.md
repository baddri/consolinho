---
id: T-0284
title: Redis in the kustomize base (Deployment, Service, NetworkPolicy, Secret contract) + deploy-dev script and runbook
status: done
owner: backend-engineer
checkpoint: 4.5b
depends_on: []          # contract only (connection-string name `redis`); light lane, no .NET build
paths: [deploy/kustomize/base/, deploy/kustomize/overlays/dev/kustomization.yaml, deploy/kustomize/overlays/prod/kustomization.yaml, deploy/kustomize/overlays/production/, scripts/check-deploy.sh, scripts/deploy-dev.sh, docs/ops/RUNBOOK.md, docs/adr/0030-*.md]
review_rounds: 1
---

## Goal
OPS-1 (manifest half): every overlay runs ≥ 3 replicas, so every overlay ships the Redis L2/backplane the cache needs
(ADR-0040 §9). Redis is ephemeral, password-protected, reachable only from the server pods, and its image is one
kustomize image reference so the disconnected prod cluster mirrors it like Postgres.

## Scope
- In: base manifests, server env + egress, overlay `images:` entries, Secret contract (example + deploy-dev script),
  `check-deploy.sh` assertions, RUNBOOK + ADR-0030 configuration-contract table rows.
- Out: app code (T-0281 owns `ConnectionStrings:redis`); deploying (T-0286); Redis HA/Sentinel/TLS (ADR-0040 Consequences).
  **No .NET build needed** — this lane can run next to a BE lane (light agent).

## Contract / design notes
- `base/redis.yaml`: `Deployment consolinho-redis` (1 replica, `strategy: Recreate`, labels
  `app.kubernetes.io/component: redis` — the server selectors already require `component: server`, so Service/PDB/HPA
  never select Redis), container `redis`, `image: redis` (logical name), port 6379, `REDIS_PASSWORD` from Secret
  `consolinho-redis` key `password`, persistence off (RDB `save ""`, AOF off), `maxmemory` ≈ 75 % of the memory limit +
  `allkeys-lru`, `emptyDir` data, `readOnlyRootFilesystem`, no SA token automount, restricted-v2 compatible
  (no fixed UID), requests/limits set (check-deploy asserts them), tcp/`redis-cli ping` probes.
  Verify the rhel9 image's env/args contract (`REDIS_PASSWORD`, config path) from its docs; with another image use
  `args: [--requirepass, $(REDIS_PASSWORD), ...]`.
- `base/redis-service.yaml`: `Service consolinho-redis` 6379 → `component: redis`.
- `base/networkpolicy-redis.yaml`: ingress to `component: redis` on 6379 **only** from pods `component: server`
  (OPS-1). Add TCP 6379 to `base/networkpolicy-egress.yaml`.
- Server container (`base/deployment.yaml`, server only — not the migrate init container):
  `REDIS_PASSWORD` (secretKeyRef `consolinho-redis/password`) then
  `ConnectionStrings__redis = consolinho-redis:6379,password=$(REDIS_PASSWORD),abortConnect=false` (env order matters
  for `$(VAR)` expansion; comment it).
- Image: each overlay adds `images: - name: redis, newName: registry.redhat.io/rhel9/redis-7, newTag: <tag>`; `prod`
  comments "pin a digest once mirrored", like its Postgres image. One entry = the only thing a disconnected mirror edits.
- Secret `consolinho-redis` (key `password`): never rendered (CFG-5); add to `overlays/production/secrets.example.yaml`,
  create in `scripts/deploy-dev.sh` (random, idempotent — same pattern as `consolinho-postgres`), document in RUNBOOK
  (create/rotate: rotate = update Secret + restart Redis and server; cache content is disposable).
- `check-deploy.sh`: add `overlays/prod` to `RENDERS`/`ROUTE_RENDERS` if commit c44f64f didn't already; assert per render:
  a `NetworkPolicy` selecting `component: redis` exists, Redis container has no `volumeClaimTemplates`/PVC, the server
  container has `ConnectionStrings__redis`. Keep the terse output style.

## Context pack
- Docs: ADR-0040 §9; ADR-0030 (configuration contract table); BACKEND.md §Hosting (L281+); `docs/ops/RUNBOOK.md`
  (`grep -n '^#'`, read the Secrets section only).
- Exemplars: `overlays/prod/postgres-statefulset.yaml` + `postgres-networkpolicy.yaml` (security context, probes,
  secretKeyRef, image comment); `base/deployment.yaml` L83–97 (server env block); `scripts/deploy-dev.sh` (grep
  `consolinho-postgres` for secret creation).
- Touch points: `scripts/check-deploy.sh` L17–19 (renders), `containers_report` (L51+), assertion block L137–200.

## Acceptance criteria
- [x] `scripts/check-deploy.sh` green with Redis in every render (OPS-1).
- [x] Rendered dev overlay: Redis reachable only from server pods (policy reviewed), no PVC, no Secret rendered.
- [x] `deploy-dev.sh` creates `consolinho-redis` once and keeps it on re-runs (shellcheck clean).
- [x] RUNBOOK + ADR-0030 contract list `consolinho-redis` and `ConnectionStrings__redis`; the Redis image is called out
      as a mirror item for disconnected installs.

## Work log
- 2026-11-24 backend-engineer: started (light lane, manifests + scripts + runbook).
- 2026-11-24 backend-engineer: base redis.yaml/-service/networkpolicy-redis, egress 6379, server env, `images:` in
  dev/prod/production, Secret in deploy-dev.sh + secrets.example, check-deploy (prod render + REDIS asserts), RUNBOOK
  §4.7 (old 4.7 → 4.8) + §1/§5 rows, ADR-0030 row. Deviation: `command: [redis-server]` instead of rhel9 run-redis
  (it appends to /etc/redis/redis.conf → breaks readOnlyRootFilesystem). check-deploy.sh green; no oc mutations.

## Review
- 2026-11-24 backend-architect, round 1: **APPROVE**. `scripts/check-deploy.sh` green (REDIS ok in dev/prod/production,
  kubeconform, shellcheck). Rendered `consolinho-redis-ingress`: Redis selected, ingress only from component=server
  (+ name/part-of) on 6379. No PVC, no Secret rendered, limits/requests + securityContext match prod Postgres plus
  readOnlyRootFilesystem; deploy-dev Secret is create-if-missing via temp file + `--from-file`, never printed.
- Deviation accepted: `redis-server` + `--requirepass $(REDIS_PASSWORD)`. `oc describe`/`-o yaml` show only the
  literal `$(REDIS_PASSWORD)`; the expanded value lives where env values already live (node CRI config, the
  container's own /proc), the pod has one container and no shareProcessNamespace, and Redis 7 rewrites its proc title.
  No worse than env; SECURITY.md has no rule against it. A mounted config file would only make sense with a Secret-
  rendered redis.conf, which is more to maintain for no gain.
- Optional: `deploy/kustomize/base/networkpolicy-redis.yaml` — Redis needs no egress; adding `Egress` to
  `policyTypes` (deny all) is cheap defence in depth.
- Optional: the migrate init container shares the server pod's network identity, so it can reach Redis on the wire
  (it has no password); the file comment says this correctly — nothing to change.
- Follow-up for T-0281 (not this task): never log the multiplexer configuration with `includePassword: true`.
- T-0286: confirm `registry.redhat.io/rhel9/redis-7:1` pulls and that its `redis-server`/`redis-cli`/`grep` are on PATH.

## Handover notes
- Redis runs `redis-server` with all settings as args (no config file): rhel9 `run-redis` writes the config at start,
  incompatible with readOnlyRootFilesystem. Password via `$(REDIS_PASSWORD)` arg expansion (pod spec holds no value;
  Redis ≥ 7 rewrites its proc title). Probe auth via `REDISCLI_AUTH`; readiness greps PONG, liveness is TCP.
- Sizing: 256Mi request = limit, `maxmemory 192mb allkeys-lru`, 50m CPU, emptyDir 64Mi (`/var/lib/redis/data`).
- Image tag `"1"` (floating major, same convention as `postgresql-16:1`) — not verified against the registry from
  here; T-0286 should confirm the pull on consolinho/prod and pin a digest for prod.
- check-deploy now renders `overlays/prod` too and asserts per overlay: Redis Deployment exists, no PVC, image
  mapped (contains `/`), a NetworkPolicy selects component=redis, server container (not migrate) has
  `ConnectionStrings__redis`; readOnlyRootFilesystem also enforced on consolinho-redis.
- Prod: Secret `consolinho-redis` must be created by hand before apply (RUNBOOK §4.7). Nothing deployed.
- Off-path: overlay header comments of prod/production list `consolinho-redis` (inside task paths).
