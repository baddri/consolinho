# CP3 — Deploy to OpenShift (spec)

**Author:** ocp-product-owner · **Date:** 2026-11-21 · **Checkpoint:** CP3 · **Branch:** `cp/3-deploy`
**Binding inputs:** ROADMAP CP3, ADR-0006 (single container), ADR-0004 (Data Protection), ADR-0007/0010/0018 (host
OAuth), SECURITY.md (Authentication, Token handling, HTTP), human decisions of 2026-11-21 (below).
**Already-filed carry-ins (not re-specified here):** T-0092 (SPA/API security headers and CSP), T-0094 (flaky
DevOAuth config test). The remaining CP2 follow-ups keep their own task files.

**Human decisions (fixed):** product/deploy name `consolinho` (image, Route, labels, OAuthClient). Dev target is the
namespace `consolinho` on the human's test cluster (the current `oc` login, OCP 4.22, internal registry Managed, no
external registry route). The test cluster is replaced often, so the dev deploy derives everything from the live `oc`
context, builds in-cluster and can be re-run on a fresh cluster. Dev Postgres runs in the namespace. The production
overlay stays generic.

## 1. Problem and goal

FleetConsole only runs under `aspire run` with the DevOAuth emulator. Nobody can use it until it runs on OpenShift,
behind a Route, logs in with the real host-cluster OAuth and proxies to a real API server. CP3 makes it **deployable,
re-deployable and operable**:

1. **One image** that serves the API and the built SPA, runs under `restricted-v2` with a random UID, and does not
   contain DevOAuth.
2. **Kustomize base + overlays**: `dev` (in-cluster build, in-namespace Postgres) and `production` (external image,
   external DB, nothing derived from `oc`).
3. **A one-command dev deploy** (`scripts/deploy-dev.sh`) that works on a cluster that was created this morning.
4. **Operability**: health probes, resource limits, NetworkPolicy, schema migrations as an explicit step, and a runbook
   that an on-call SRE can follow at 3 a.m.

**Demo at the end of CP3:** the human runs `scripts/deploy-dev.sh` on a fresh test cluster. The script finishes and
prints the Route URL. The human opens it, signs in with the cluster's OAuth (the login is the configured bootstrap
admin) and lands in the console. They register the host cluster itself as a managed cluster with the smoke SA token,
grant themselves access, switch to it and see the `consolinho` project's pods (its own pod and Postgres) live. Running
the script a second time is a no-op apart from a new build and rollout, and the login and saved SA token still work.

## 2. Personas

| Persona | What they need from CP3 |
|---|---|
| **Platform SRE deploying it** (Priya) | One reproducible deploy on a throwaway cluster; a generic production overlay she can feed into GitOps; a runbook |
| **On-call SRE** (Sam) | Probes that mean something, logs that explain a failed login, a known recovery path for a lost admin or lost key |
| **Security reviewer** (Ines) | No secrets in Git or the image, restricted SCC, NetworkPolicy, CSP, TLS everywhere, SA tokens still encrypted at rest |

## 3. User stories

- US-1 As a platform SRE I want to run one script against my current `oc` login so that a fresh test cluster has a working console in minutes.
- US-2 As a platform SRE I want to re-run the deploy safely so that I can ship a new build without losing users, grants or encrypted SA tokens.
- US-3 As a platform SRE I want a production overlay without cluster-specific values so that I can deploy it through GitOps with my own image, DB and secrets.
- US-4 As an operator I want to log in with my OpenShift identity on the Route so that I don't need another password.
- US-5 As an on-call SRE I want liveness and readiness that reflect reality so that OpenShift restarts a hung pod but doesn't restart-loop it during a DB outage.
- US-6 As an on-call SRE I want a runbook for deploy, upgrade, rollback, backup and the common failures so that I don't have to read the code.
- US-7 As a security reviewer I want the pod to run unprivileged, accept traffic only from the router, and send strict security headers so that the console is not the weakest link to 40 clusters.

## 4. Acceptance criteria

Conventions: "the script" = `scripts/deploy-dev.sh`. "Generated secret" = created once by the script when it is
missing and never regenerated after that. Exact file names, keys and flags are the architects' call unless quoted here.

### 4.1 Container image (IMG)

- **IMG-1** `deploy/Containerfile` is multi-stage: Node build of `web/` → `dotnet publish` of `FleetConsole.Api` →
  runtime on a UBI or chiseled .NET 10 ASP.NET base (ADR if it deviates from ADR-0006). Builds with `podman build` locally
  and with an OpenShift Docker-strategy build.
- **IMG-2** One container serves the API and the SPA on a single non-privileged port (8080). No Node runtime, SDK,
  sources, test projects or `FleetConsole.DevOAuth` in the final image (checked by a build-time or test assertion).
- **IMG-3** Runs as an arbitrary non-root UID in group 0 under the `restricted-v2` SCC with a read-only root filesystem
  (writable `emptyDir` only where needed, e.g. `/tmp`). No secret, token or kubeconfig in any layer.
- **IMG-4** Build inputs are reproducible: lockfiles are honoured (`npm ci`, central package versions) and a
  `.containerignore` keeps `bin/`, `obj/`, `node_modules/`, `.git/` and local secrets out of the build context.

### 4.2 Hosting in production mode (HOST)

- **HOST-1** In `Production`, the Api serves `index.html` for SPA client routes (deep links such as
  `/c/<cluster>/k8s/ns/x/pods/y` work on reload). `/api/**` never falls back to the SPA, so unknown API paths return
  ProblemDetails 404.
- **HOST-2** Caching: `index.html` is `no-cache`, and hashed assets are long-lived `immutable`.
- **HOST-3** **T-0092** is done: CSP and the other security headers are on the SPA, assets and API responses, and the
  Monaco YAML tab works under the CSP.
- **HOST-4** Behind an edge-terminated Route the session cookie is still `Secure` (the app sees plain HTTP). The OAuth
  `redirect_uri` comes from `Console:PublicOrigin` (unchanged rule), never from forwarded headers.
- **HOST-5** The full request URL is never logged in Production, so OAuth `code`/`state` don't appear. This closes the
  SECURITY.md § Token handling CP3 follow-up and is enforced in code, not only through the log-level default. Logs go
  to stdout in a structured (JSON) format.
- **HOST-6** Missing or invalid production configuration (DB, public origin, OAuth client, CA bundle, DP key
  certificate) fails startup with one clear log line naming the key. The secret value is never logged.

### 4.3 Health probes (PRB)

- **PRB-1** Production exposes liveness and readiness endpoints. Today they are mapped in Development only
  (`ServiceDefaults`). They return only a status, with no check names, exception text or versions, and are anonymous
  without CSRF.
- **PRB-2** Liveness does not depend on Postgres or any cluster, so a DB outage does not cause restarts.
  Readiness includes Postgres. A startup probe (or a generous initial delay) covers cold start.
- **PRB-3** Given Postgres is scaled to 0, When 60 s pass, Then the pod is NotReady but not restarted. When Postgres
  comes back, Then the pod is Ready again without intervention.

### 4.4 Configuration & secrets (CFG)

- **CFG-1** All settings come from environment variables or mounted files; nothing is cluster-specific in the image.
  Non-secret settings go in a ConfigMap (public origin, host API URL, bootstrap admins, admin groups, auto-provision,
  CA bundle path). Secrets go in Secrets: DB connection, OAuth client secret, DP key certificate (+ password if used).
- **CFG-2** **Data Protection**: the key ring stays in Postgres (ADR-0004) and is encrypted with a certificate mounted
  from a Secret (`DataProtection:KeyEncryptionCertificatePath`). Production refuses to start without it.
- **CFG-3** **Bootstrap admin**: `Auth:BootstrapAdminUsers` is set from deploy configuration. The dev default is the
  `oc whoami` user and can be overridden.
- **CFG-4** **Host OAuth CA trust**: the mounted CA bundle includes the in-cluster SA `ca.crt` and the CA that signs
  the OAuth route (the ingress CA on test clusters with self-signed ingress). `SkipTlsVerify` is never used.
- **CFG-5** No secret value is committed. Base and overlays only reference Secret names, and an example file documents
  the expected keys with obviously fake values.

### 4.5 Database & migrations (DB)

- **DB-1** In Production the Api does not migrate at startup (unchanged). Schema migrations run as an explicit step
  before the new version serves traffic: a Job or an init container using the **same image** (architects decide, see
  Q3). The step is idempotent and safe if two pods start at once.
- **DB-2** A failed migration blocks the rollout (the old pods keep serving) and its error shows in `oc logs`.
- **DB-3** **Dev**: Postgres runs in the namespace with a PVC, a generated password Secret, `restricted-v2` compatibility
  and probes. It uses a Red Hat Postgres image pulled with the cluster's global pull secret. Data survives pod restarts
  and script re-runs.
- **DB-4** **Production**: an external Postgres is the recommended and documented default (backups, HA and upgrades are
  owned by a DBA or managed service). The overlay contains no Postgres workload. See Q1.

### 4.6 Kubernetes manifests (K8S)

- **K8S-1** `deploy/kustomize/base` plus overlays `dev` and `production`. `oc kustomize` renders each one without
  errors, and the render is validated in CI or a test (e.g. `kubeconform` or a server-side dry-run documented as a
  human step).
- **K8S-2** Common labels `app.kubernetes.io/name: consolinho`, `part-of`, `component`, `version`. The Deployment,
  Service and Route are named `consolinho`.
- **K8S-3** The Route uses **edge TLS** with `insecureEdgeTerminationPolicy: Redirect` and HSTS
  (`haproxy.router.openshift.io/hsts_header`). The watch and log streams aren't cut by the router, because the route
  timeout is ≥ the proxy watch cap of 300 s.
- **K8S-4** Resources: CPU/memory requests and a memory limit on every container, tuned for one replica serving ~50
  users (the architects size it). The Deployment uses a rolling update with `maxUnavailable: 0`.
- **K8S-5** Pod security: `runAsNonRoot`, `allowPrivilegeEscalation: false`, drop `ALL` capabilities,
  `seccompProfile: RuntimeDefault`, `readOnlyRootFilesystem: true`, and `automountServiceAccountToken: false` unless
  the in-cluster CA (CFG-4) is mounted that way (architects decide). The pod's own SA has no RBAC.
- **K8S-6** **NetworkPolicy**: ingress to the console pod only from the OpenShift router namespace (policy-group
  label) on 8080. Ingress to Postgres (dev) only from the console pods (and the migration Job). Egress restrictions
  are recommended (DNS, Postgres, 443/6443) but not required (see Q4).
- **K8S-7** `production` overlay: image by digest or tag via `images:`, replicas ≥ 2 with a PodDisruptionBudget, no
  Postgres, no BuildConfig/ImageStream, and placeholders that `kustomize` users replace (documented). Nothing in it is
  derived from `oc`.

### 4.7 Dev deploy script (DEV)

- **DEV-1** `scripts/deploy-dev.sh` uses only the current `oc` context. Before changing anything it prints the target
  API URL, the user and the namespace, then asks for confirmation (`--yes` skips the prompt). It aborts if not logged
  in or if the user can't create the OAuthClient. Engineer agents and CI never run it (CLAUDE.md rule 6). Exception authorized by the human
  (2026-11-21): the orchestrator (or QA when delegated) may run it with `--yes` against the current `oc` context, ns
  `consolinho` only, after checking `oc whoami --show-server`. `--teardown` stays human-only.
- **DEV-2** It derives from the live cluster: the API server URL (`oc whoami --show-server`), the apps domain
  (`ingresses.config/cluster .spec.domain`), the Route host (`consolinho.<apps-domain>`, giving `Console:PublicOrigin`),
  the OAuth issuer/endpoints (discovered via `/.well-known/oauth-authorization-server`, or left to the Api's
  discovery), and the ingress CA for CFG-4.
- **DEV-3** It creates or updates the namespace `consolinho`, applies the `dev` overlay with the derived values,
  builds the image in the cluster (binary Docker-strategy BuildConfig → ImageStream `consolinho`,
  `oc start-build --from-dir --follow`) and rolls the Deployment to the new image.
- **DEV-4** It creates or updates the **OAuthClient `consolinho`**. That OAuthClient is the only object outside the
  namespace. Its redirect URI is `https://<route-host>/api/auth/callback`, `grantMethod: auto`, and its secret comes
  from the generated secret in the namespace.
- **DEV-5** **Idempotent**: on a second run against the same cluster, the generated secrets (OAuth client secret, DB
  password, DP key certificate) are reused, not regenerated. Existing users, grants and encrypted SA tokens still work
  after the run. The only changes are a new build and rollout.
- **DEV-6** **Fresh cluster**: on a newly installed cluster with only the current `oc` login, one run brings the app to
  Ready. The script waits for rollout and fails with a non-zero exit and a clear message if it doesn't.
- **DEV-7** At the end it prints the Route URL, the bootstrap admin username and the smoke-test instructions
  (SMK-1). It never prints the OAuth secret, DB password, or any token.
- **DEV-8** `--teardown` deletes the namespace and the OAuthClient after a confirmation that names the cluster.
- **DEV-9** `shellcheck`-clean, `set -euo pipefail`, and the only dependencies are `oc`, `openssl` and coreutils
  (stated in the script header).

### 4.8 Smoke setup: the host cluster as a managed cluster (SMK)

- **SMK-1** The script ensures a ServiceAccount `consolinho-smoke` in the namespace `consolinho` with a **RoleBinding**
  to `view` in that namespace only. Nothing cluster-scoped is created for the smoke test. It prints the steps:
  (1) `oc create token consolinho-smoke -n consolinho --duration=168h` (the human runs it and pastes the token; the
  script doesn't echo it), (2) Fleet administration › Clusters › Register with the printed API URL and the CA bundle
  file path, environment `dev`, (3) add a credential with the token and **Test** it, (4) grant the admin user ReadOnly.
- **SMK-2** Given those steps are done, When the admin switches to the host cluster and opens Pods in project
  `consolinho`, Then the console's own pod and Postgres are listed and update live. The YAML tab works under the CSP.
- **SMK-3** The runbook explains how to widen the smoke SA (`cluster-reader`) by hand. That step creates a
  cluster-scoped binding, so it is the human's choice and not in the script.

### 4.9 Runbook (OPS)

- **OPS-1** `docs/ops/RUNBOOK.md` covers: prerequisites, first dev deploy, production deploy with the overlay
  (required Secrets/ConfigMap keys, OAuthClient creation, CA bundle), upgrade and rollback (forward-only migrations:
  roll back the image only if the schema is compatible, else restore), backup and restore, and the configuration
  reference.
- **OPS-2** Key-loss warning, stated prominently: **losing the DP certificate or the `data_protection_keys` table
  makes every stored SA token unreadable.** Back up both. The runbook gives the procedure to rotate the certificate
  (keep the old one available for decryption).
- **OPS-3** Troubleshooting with the symptom → cause → fix for: login `unavailable` (CA bundle / OAuth route trust),
  OAuth `redirect_uri` mismatch (Route host vs OAuthClient), `not_registered` with auto-provision off, lost last admin
  (bootstrap admin recovery), pod NotReady (DB), Route 504 on long watches, and a build that fails pulling base images.

### 4.10 Quality gates (QG)

- **QG-1** `scripts/check-be.sh` and `scripts/check-fe.sh` are green. **T-0094** is done (the flaky DevOAuth config test
  passes 20/20 under a parallel full suite).
- **QG-2** Integration tests for HOST-1/2/3/5 and PRB-1/2 run against the Production pipeline configuration
  (WebApplicationFactory with environment `Production` and the required settings faked).
- **QG-3** Image check: a script or CI step builds the image with podman, runs it with a random UID and a read-only
  root filesystem against a throwaway Postgres, and asserts that `/` serves the SPA, that the probes answer, and that
  `FleetConsole.DevOAuth*` is absent.
- **QG-4** The kustomize render (K8S-1) is part of a check script.

### 4.11 Cluster checks (orchestrator/QA may run H1–H6 under the DEV-1 exception; H7 is human-only)

- **H1** On a fresh test cluster, `scripts/deploy-dev.sh` completes and the pod is Ready (DEV-6). Run it again; the
  second run is a no-op apart from the rollout (DEV-5).
- **H2** Open the Route: it uses HTTPS, HTTP redirects to HTTPS, and HSTS is present. The login goes through the
  cluster's OAuth (no approval prompt), and the bootstrap admin lands on the console. The cookie is
  `Secure; HttpOnly`.
- **H3** Smoke steps SMK-1/2: register the host cluster, test the credential, grant, browse Pods in `consolinho`, see
  live updates (delete the Postgres pod and watch it come back), and open YAML.
- **H4** After the second run of H1, the registered credential still tests OK (the key ring and certificate survived).
- **H5** `oc get pod -o yaml` shows SCC `restricted-v2`, a non-root UID and a read-only root filesystem. `oc logs` after
  a login contains no `code=`, tokens or secrets.
- **H6** `oc scale statefulset/postgres --replicas=0` makes the console pod NotReady with no restarts. Scaling back
  recovers it (PRB-3).
- **H7** `--teardown` removes the namespace and the OAuthClient. `oc get oauthclient consolinho` returns NotFound.

## 5. UX notes

- No new screens. The SPA must behave exactly as under Vite: deep links, reload and `returnUrl` after login.
- When the console can't reach the host OAuth at login, the existing `/login?error=unavailable` page should say "Can't
  reach the cluster's sign-in service. Ask an administrator to check the console's CA bundle." The admin details are in
  the runbook (OPS-3), not on the page.
- Script output works like a checklist: one line per step (`✓ OAuthClient consolinho updated`), with values that
  identify the target (cluster API URL, Route) printed in full. The confirmation prompt names the cluster API URL, in
  the same spirit as naming the cluster in UI confirmations.
- The masthead environment colour on the host cluster comes from the registration (`dev`). The deploy doesn't add an
  "instance banner"; that idea goes to the backlog.

## 6. Out of scope (CP3)

- GitOps (Argo CD) application manifests, Helm chart, Operator/OLM packaging.
- An HA Postgres operator (CloudNativePG/Crunchy), automated backups, PITR. The runbook documents them, nothing more.
- cert-manager integration and Route re-encrypt/passthrough TLS. Edge TLS only.
- OpenTelemetry collector, dashboards, alerts, ServiceMonitor (CP6).
- Horizontal autoscaling. Rate limiting and caching (CP6).
- Automating cluster registration or grants through the admin API from the script (SMK-1 is manual on purpose).
- A multi-arch image (amd64 only unless free).

## 7. Open questions (with recommendation)

| # | Question | Recommendation |
|---|---|---|
| Q1 | Postgres in production? | **External**, managed or DBA-run, reached through a connection-string Secret. The in-namespace Postgres is dev-only; a single-pod DB holding the encrypted credentials for 40 clusters is not a production posture. |
| Q2 | Base image: UBI or chiseled? | **UBI 9 .NET 10 runtime** (`ubi9/dotnet-100-runtime` or `-minimal`), for Red Hat support, the familiar OpenShift group-0 permissions model and an in-cluster pull without extra pull secrets. Chiseled is acceptable if the architects show it runs under `restricted-v2` with an arbitrary UID. Either way, record the choice in an ADR amending ADR-0006. |
| Q3 | Migrations: Job or init container? | **Init container** running the same image in a migrate-only mode. It reruns on every rollout without Job immutability problems and blocks the rollout on failure (DB-2). It relies on the EF Core migration lock for concurrency. A Job adds ordering problems for plain `oc apply`/kustomize. |
| Q4 | Egress NetworkPolicy? | **Ingress policies are required; egress is optional.** Restrict egress to DNS, Postgres and TCP 443/6443 by port. Managed clusters' API IPs are not known ahead of time, so per-IP egress is out of scope. |
| Q5 | Host API URL in cluster: external (`oc whoami --show-server`) or `https://kubernetes.default.svc`? | **`kubernetes.default.svc`** for the host identity calls (no hairpin through the external LB, SA `ca.crt` trust). The external URL is used only as the *managed cluster* API URL in SMK-1. The OAuth endpoints are discovered and are the public OAuth route. |
| Q6 | Ingress CA source for CFG-4? | The script reads `openshift-config-managed/default-ingress-cert` (`ca-bundle.crt`) and concatenates it with the SA `ca.crt` into a ConfigMap. In production the operator supplies the bundle. |
| Q7 | OAuthClient `grantMethod`? | `auto` (same as the OCP console). Scope stays `user:info`. |
| Q8 | `kube:admin` as bootstrap admin? | Allow it, but the script warns that a dedicated identity-provider user is better: `kube:admin` disappears when the cluster is properly configured. |
| Q9 | Smoke token lifetime? | `--duration=168h` (outlives a test cluster, exercises the `exp` display). If the API server caps it, use the default and note it in the runbook. |
| Q10 | Audit client IP behind the router? | Trust `X-Forwarded-For` only from the router network (forwarded-headers middleware with known networks from configuration). Otherwise record the router IP. If it's more than a small task, defer to CP6. |

## 8. Proposed ROADMAP backlog additions (for the orchestrator to append)

- Instance banner / masthead text per deployment (e.g. "consolinho on test-cluster-17") for people running several consoles.
- Argo CD Application + example `production` overlay repo layout.
- Prometheus metrics endpoint + ServiceMonitor; alerts for login failures and proxy 5xx rate.
- Self-registration of the host cluster as a managed cluster (one click, admin only) for single-cluster installs.
- DP certificate rotation helper (script or admin page showing key ring age/expiry).
