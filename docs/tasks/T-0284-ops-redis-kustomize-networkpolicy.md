---
id: T-0284
title: Redis in the kustomize base (Deployment, Service, NetworkPolicy, Secret contract) + deploy-dev script and runbook
status: todo
owner: backend-engineer
checkpoint: 4.5b
depends_on: []          # contract only (connection-string name `redis`); light lane, no .NET build
paths: [deploy/kustomize/base/, deploy/kustomize/overlays/dev/kustomization.yaml, deploy/kustomize/overlays/prod/kustomization.yaml, deploy/kustomize/overlays/production/, scripts/check-deploy.sh, scripts/deploy-dev.sh, docs/ops/RUNBOOK.md, docs/adr/0030-*.md]
review_rounds: 0
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
- [ ] `scripts/check-deploy.sh` green with Redis in every render (OPS-1).
- [ ] Rendered dev overlay: Redis reachable only from server pods (policy reviewed), no PVC, no Secret rendered.
- [ ] `deploy-dev.sh` creates `consolinho-redis` once and keeps it on re-runs (shellcheck clean).
- [ ] RUNBOOK + ADR-0030 contract list `consolinho-redis` and `ConnectionStrings__redis`; the Redis image is called out
      as a mirror item for disconnected installs.

## Work log

## Review

## Handover notes
