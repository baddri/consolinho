# 0030 — OpenShift manifests (kustomize), configuration contract and the dev deploy script
**Status:** Accepted (2026-11-21) · builds on ADR-0006, 0026–0029 · CP3 spec CFG-*, DB-3/4, K8S-*, DEV-*, SMK-*, Q1, Q4–Q9

## Context
CP3 deploys `consolinho` to OpenShift: a dev path that derives everything from the current `oc` login on a
frequently reinstalled test cluster, and a production path for operators using kustomize with no `oc`-derived values.

## Decision
### Layout (`deploy/kustomize/`)
- `base/` — ServiceAccount `consolinho` (no RBAC, `automountServiceAccountToken: false`), Deployment, Service and
  Route `consolinho`, NetworkPolicies, `configMapGenerator consolinho-config` (shared literals; overlays add theirs
  with `behavior: merge`). No namespace, no Secrets, no image tag.
- `overlays/dev/` — `namespace: consolinho`; Postgres StatefulSet + Service `postgres` + its NetworkPolicy; smoke SA;
  committed placeholder values (`https://consolinho.apps.dev.invalid`, admin `REPLACE_ME`); image
  `image-registry.openshift-image-registry.svc:5000/consolinho/consolinho:latest`.
- `overlays/production/` — `namespace: consolinho`, replicas 2 + PDB `minAvailable: 1` (superseded: HPA + PDB in base, see
  Amendment 2026-11-24), `images:` placeholder
  (`registry.example.com/consolinho/consolinho:REPLACE_ME`), placeholder ConfigMap values, `secrets.example.yaml`
  (not referenced by the kustomization; documents Secret keys with obviously fake values). No Postgres, no build
  objects.
- `build/` — dev-only BuildConfig + ImageStream `consolinho` (binary, Docker strategy, ADR-0026), applied by the script
  before the first build. Kept out of the overlays so the production render never contains them.
- Every overlay renders with `oc kustomize`/`kubectl kustomize`/`kustomize build` without generated files;
  `scripts/check-deploy.sh` renders all of them (QG-4).

### Labels
`labels:` with `includeSelectors: true`: `app.kubernetes.io/name: consolinho`, `app.kubernetes.io/part-of:
consolinho`. Per resource: `app.kubernetes.io/component: server | database | smoke` (in selectors where set).
`app.kubernetes.io/version` only with `includeSelectors: false` (overlay; the script sets the git short SHA).

### Configuration contract (CFG-1; env var names are .NET configuration keys with `__`)
| Source | Key → target |
|---|---|
| ConfigMap `consolinho-config` (generated, `envFrom` on `server`) | `ASPNETCORE_ENVIRONMENT=Production` (also on dev clusters), `Console__PublicOrigin`, `Auth__OpenShift__HostApiServerUrl=https://kubernetes.default.svc` (Q5), `Auth__OpenShift__ClientId=consolinho`, `Auth__OpenShift__CaBundlePath=/etc/consolinho/ca/ca-bundle.crt`, `Auth__AutoProvision=true`, `Auth__BootstrapAdminUsers__0`, `DataProtection__KeyEncryptionCertificatePath=/etc/consolinho/dp/certificate.pfx`, `DataProtection__KeyEncryptionCertificatePasswordPath=/etc/consolinho/dp/password` (optional, documented: `Auth__AdminGroups__N`; `DataProtection__PreviousKeyEncryptionCertificatePath`/`…PasswordPath` during a certificate rotation, ADR-0028 §6) |
| Secret `consolinho-db` | `connection-string` → env `ConnectionStrings__consoledb` (server **and** migrate) |
| Secret `consolinho-oauth` | `client-secret` → env `Auth__OpenShift__ClientSecret`; same value as the OAuthClient's `secret` |
| Secret `consolinho-redis` (ADR-0040 §9) | `password` → env `REDIS_PASSWORD` on the `server` container (then `ConnectionStrings__redis=consolinho-redis:6379,password=$(REDIS_PASSWORD),abortConnect=false`, declared after it for `$(VAR)` expansion) and on the base Redis Deployment (`--requirepass`, `REDISCLI_AUTH` for the probe); kustomize image name `redis` (one `images:` entry per overlay = the disconnected-mirror item) |
| Secret `consolinho-dp-cert` | `certificate.pfx`, `password` → volume `/etc/consolinho/dp` (read-only, `defaultMode: 0440`) |
| ConfigMap `consolinho-ca-bundle` (not generated; script/operator) | `ca-bundle.crt` → volume `/etc/consolinho/ca` |
| Secret `consolinho-postgres` (dev only) | `database-user`, `database-password`, `database-name` → `POSTGRESQL_USER/PASSWORD/DATABASE` |

The Route host is not a separate parameter: a kustomize `replacements` entry copies it from `consolinho-config`
`data.Console__PublicOrigin` (`delimiter: "/"`, `index: 2`), so the OAuth redirect URI and the Route can't drift.
Replacements run after the generators of the *same* kustomization only, so the stanza sits in the **outermost**
kustomization of every render (dev, production, and the script's generated overlay) — not in base or a component —
and `scripts/check-deploy.sh` asserts Route `spec.host` == the PublicOrigin host for each rendered overlay.

### Workloads
- **Deployment `consolinho`**: `strategy.rollingUpdate {maxUnavailable: 0, maxSurge: 1}`; init container `migrate`
  (args `["migrate"]`, env `ConnectionStrings__consoledb` + `ASPNETCORE_ENVIRONMENT` only; ADR-0027); container
  `server`, port `http` 8080. Pod: `runAsNonRoot: true`, `seccompProfile: RuntimeDefault`; containers:
  `allowPrivilegeEscalation: false`, `capabilities.drop: [ALL]`, `readOnlyRootFilesystem: true`; no `runAsUser`
  (SCC assigns); `/tmp` `emptyDir` (`sizeLimit: 256Mi`).
- **Probes** (ADR-0028): startup `/alive` (period 2 s, failureThreshold 30), liveness `/alive` (period 10 s, timeout
  2 s, failureThreshold 3), readiness `/health` (period 5 s, timeout 3 s, failureThreshold 2).
- **Resources** (one replica, ~50 users; mostly I/O and long-lived watch streams): `server` requests 100m/256Mi, limit
  memory 768Mi; `migrate` 50m/128Mi, limit 512Mi; Postgres (dev) 100m/256Mi, limit 1Gi, PVC 5Gi RWO (default
  StorageClass); build pod 500m/1Gi, limit 4Gi. No CPU limits. (scaling: see Amendment 2026-11-24)
- **Route**: edge TLS, `insecureEdgeTerminationPolicy: Redirect`, annotations
  `haproxy.router.openshift.io/timeout: 330s` (> 300 s watch cap) and `haproxy.router.openshift.io/hsts_header:
  max-age=31536000` (no `includeSubDomains`/`preload`: never affect other apps on the apps domain).
- **Postgres (dev only, Q1)**: StatefulSet `postgres` (1 replica, `registry.redhat.io/rhel9/postgresql-16`, pulled
  with the cluster's global pull secret), data at `/var/lib/pgsql/data` from a volumeClaimTemplate, exec probes
  `/usr/libexec/check-container` (readiness) and `--live` (liveness), restricted-v2 security context **without**
  `readOnlyRootFilesystem` (the image writes its config under `$HOME`; documented exception). Production uses an
  external Postgres (DB-4).
- **NetworkPolicies**: base `consolinho-ingress` (server pods ← namespaces labelled
  `policy-group.network.openshift.io/ingress: ""`, TCP 8080) and `consolinho-egress` (server pods → any destination
  on UDP/TCP 53 and 5353, TCP 5432, 443, 6443; by port only, Q4). Dev `postgres-ingress` (database pods ← server pods,
  TCP 5432; the migrate init container is in the server pod).
- **Smoke (SMK-1, dev only)**: ServiceAccount `consolinho-smoke` + RoleBinding `consolinho-smoke-view` → ClusterRole
  `view`, namespaced. Nothing cluster-scoped.

### OAuth and trust
- OAuthClient `consolinho` (the only cluster-scoped object, created by the script/operator, never by kustomize):
  `grantMethod: auto` (Q7), `redirectURIs: [<PublicOrigin>/api/auth/callback]`, `scopeRestrictions: [{literals:
  [user:info]}]`, `secret` = Secret `consolinho-oauth` `client-secret`.
- CA bundle (CFG-4, Q6): `kube-root-ca.crt` ConfigMap of the namespace (trust for `kubernetes.default.svc`; no SA
  token automount needed) + `openshift-config-managed/default-ingress-cert` `ca-bundle.crt` (OAuth route on
  self-signed ingress). In production the operator supplies the bundle (incl. a public root CA if the OAuth route
  uses one: the bundle **replaces** system trust).

### `scripts/deploy-dev.sh`
Dependencies `oc`, `openssl`, coreutils, **`git` and `tar`** (archive of the working tree, ADR-0026 §4 — a deliberate
addition to DEV-9's list). Flags: `--yes`, `--admin <user>` (default `oc whoami`; warns on `kube:admin`, Q8),
`--teardown` (human only), `--help`. Generated secrets (OAuth client secret, DB password, DP certificate + password)
are created once with `openssl` into a `mktemp -d` (umask 077, removed by `trap`), stored via `--from-file` (never
argv), and read back from the cluster on re-runs; never echoed. Cluster-derived values reach kustomize through a
gitignored overlay `deploy/kustomize/overlays/.dev-generated/` (`resources: [../dev]`, `configMapGenerator` with
`behavior: merge`, `images:` with the built digest, version label), rewritten on every run. The SMK CA bundle file
for the human is written to `${XDG_CACHE_HOME:-$HOME/.cache}/consolinho/ca-bundle.crt`.

## Consequences
- Production operators copy `overlays/production`, replace placeholders, create three Secrets + the CA ConfigMap and
  the OAuthClient (runbook). Nothing is derived from `oc`.
- Egress by port still allows any IP on 443/6443; per-IP egress is impossible for 40 clusters with unknown IPs.
- `kube-root-ca.crt` must cover the external API URL used for SMK-1; if the cluster serves a custom named certificate,
  the human adds its CA to the uploaded bundle (runbook).

## Amendment (2026-11-24, CP4c, T-0230/T-0231) — horizontal scaling (HPA, min 3 replicas)
Human directive: "add hpa to our deployment, min replica 3". Supersedes the fixed `replicas` (base 1, production 2),
the production-only PDB (`minAvailable: 1`) and the "one replica" sizing note under *Workloads*.
- **HPA in base** (`autoscaling/v2`, `consolinho` → Deployment `consolinho`), so dev and production both run it:
  `minReplicas: 3`, `maxReplicas: 6`, one metric: CPU `Utilization` `averageUtilization: 75` (of the 100m request).
  *Why CPU only:* the server is I/O-bound (watch/log streams); .NET's GC keeps its heap after a burst, so a memory
  target would scale up and never back down; the 768Mi memory limit stays the leak guard. *Why max 6:* the 100m request
  was sized for ~50 users on one pod (6x headroom over that sizing), every proxied request runs one Postgres
  authorization query until the CP4.5 cache (ADR-0035), so pods beyond the DB's capacity buy nothing, and
  `maxReplicas x Npgsql Maximum Pool Size (default 100) + 5` must stay ≤ Postgres `max_connections` (runbook rule;
  actual use is far lower, connections are held only per query).
  `behavior`: scale-up stabilization 60 s, at most +2 pods per 60 s; scale-down stabilization 600 s, at most −1 pod per
  300 s — each removed pod cuts its open exec sessions and log/watch streams (the SPA re-lists/re-watches, a terminal
  shows "closed"), so shrinking is deliberately slow.
- **Deployment has no `spec.replicas`** (the HPA owns it; `check-deploy.sh` enforces). Requests stay
  `server` 100m/256Mi, `migrate` 50m/128Mi (HPA needs the CPU request; a change to it changes the scaling point).
  `topologySpreadConstraints`: `kubernetes.io/hostname`, `maxSkew: 1`, `whenUnsatisfiable: ScheduleAnyway`,
  `matchLabelKeys: [pod-template-hash]` (three pods on one node would defeat the point). `lifecycle.preStop.sleep`
  5 s so the router drops the endpoint before SIGTERM; default 30 s grace.
- **PDB in base**: `maxUnavailable: 1` (valid for any replica count, unlike `minAvailable` against a moving count).
- **Replica-safety inventory** (verified 2026-11-24): session/OAuth correlation cookies are stateless and protected by
  the shared DB key ring (ADR-0028 §6, same application name) — no affinity needed; no `ITicketStore`, no session
  middleware; authorization is one DB query per request with no cache (ADR-0019; the CP4.5 cache must keep the Redis
  backplane of ADR-0035); the per-cluster invoker pool compares settings by value on every lookup (ADR-0036); audit
  rows go straight to Postgres; migrations are serialised by the advisory lock (ADR-0027 §4); WebSocket exec/log
  streams are single connections pinned to one pod by TCP (no cross-pod state). **One gap, fixed by T-0231:** on an
  empty key ring, concurrent cold starts each create an *active* key and cache only their own until the 24 h ring
  refresh, so a token/cookie protected by one pod is unreadable on another. Rule: the first key is created under a
  Postgres advisory lock (key distinct from the migration lock), and readiness (`/health`) includes a `keyring` check
  that is Healthy only after the key ring was loaded, so a pod takes no traffic before that. Later rotations are safe
  (DP creates successor keys 2 days ahead of activation).
- **Rollout of the change**: `oc apply` of a manifest that drops `spec.replicas` resets it to 1 until the HPA acts
  (~15–30 s). The runbook documents the one-time `view-last-applied | del(.spec.replicas) | set-last-applied` step for
  production; dev (1 replica today) needs nothing. `oc scale --replicas=0` still works for maintenance (the HPA does
  not act on a target scaled to 0); restore with `--replicas=3`.

## Amendment (2026-11-24, T-0242) — requests and HPA sized from a load test
The human saw the HPA scale 3 → 5 right after a rollout without load. Prometheus showed why: new pods run their JIT
warm-up at 100–195m for 2–3 min, above the 75m scaling point (75 % of 100m). A k6 run on consolinho (`deploy/loadtest/`,
3 pinned pods, console request mix, 5 → 120 req/s, 0 errors, p95 71 ms) measured CPU ≈ 25m + ~9m per req/s per pod,
memory flat at 130–175 MiB, Postgres up to 177m (the per-request authorization query, see above). Supersedes the 100m
request, the 75 % target and the 60 s scale-up window of the amendment above:
- `server` requests **250m**/256Mi (limit 768Mi unchanged); HPA target **70 %** (≈ 175m ≈ 17 req/s per pod).
- Scale-up stabilization **180 s**: the HPA takes the lowest recommendation in the window, which hides warm-up.
- Still CPU only: the test confirmed memory does not follow load.
Re-run the test after changes to the proxy hot path or the CP4.5 authorization cache.
