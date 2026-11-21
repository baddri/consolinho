# CP3 — Deploy to OpenShift: QA acceptance

**Date:** 2026-11-21 · **Branch:** `cp/3-deploy` @ `894120a` (+ 1 QA test, uncommitted) · **Spec:**
`CP3-deploy-to-openshift.md` §4

**Gates:** `check-be.sh` green (325 + 684 + 764 tests, 0 skipped; +1 QA test run separately, 23/23 in its classes) ·
`check-fe.sh` green (lint, typecheck, 60 files, 693 tests, build) · `check-deploy.sh` green (render dev/production/build
with `oc kustomize`, kubeconform 11 + 7 valid, 1 skipped each = Route CRD; shellcheck ×3) · `check-image.sh` green
(steps 1–8, 306 MiB, random UID 182614:0, read-only) · e2e `npm run e2e` against `aspire start --launch-profile http`:
7/7 (incl. HOST-3 `csp.e2e.ts` on the production build).

**Final (2026-11-21, human cluster checks):** all 48 criteria PASS (PRB-2 fixed by T-0106); H1–H7 PASS. CP3 closed.

**QA verdict (before human checks): 48 criteria, 44 PASS (2 of them also wait on H4), 1 FAIL (medium, non-blocking), 3 HUMAN (PRB-3, DEV-8,
SMK-2).** Cluster checks: H1 and H5 PASS, H2 partial, H3/H4/H6/H7 HUMAN. The failure is PRB-2 → T-0106. If Postgres is
down when the pod starts, the host does not listen for about 61 s, which is longer than the 60 s startup-probe budget.
HUMAN rows still need H2 (interactive login), H3, H4, H6 and H7 on a cluster. Live evidence from the orchestrator run
(2026-11-21, OCP 4.22 sandbox, ns `consolinho`) is recorded under §Cluster checks. QA did not run anything against a
cluster.

Test paths are abbreviated. `BE:` = `tests/FleetConsole.Api.Tests/`, `IMG n` = `scripts/check-image.sh` step n,
`DEP` = `scripts/check-deploy.sh`, `DD:` = `scripts/deploy-dev.sh`, `K:` = `deploy/kustomize/`. **(QA)** marks
evidence added in this verify step.

## Container image (IMG)

| AC | Evidence | Verdict |
|---|---|---|
| IMG-1 Multi-stage UBI | `deploy/Containerfile:16` ubi9/nodejs-22 → `:25` ubi9/dotnet-100 publish → `:43` ubi9/dotnet-100-aspnet; IMG 1 (podman build); H1 in-cluster Docker-strategy build ok | PASS |
| IMG-2 One port, no SDK/Node/DevOAuth | `Containerfile:58` `ASPNETCORE_HTTP_PORTS=8080`; IMG 2 `find /` for `FleetConsole.DevOAuth*`, `AppHost*`, `*.Tests.dll`, SDK/node; IMG 6 SPA + API on 8080 | PASS |
| IMG-3 Arbitrary UID / gid 0 / RO root | `Containerfile:54` `chgrp 0 && chmod g=u`; IMG 2/5/6 run with `--user <random>:0 --read-only --tmpfs /tmp`; H5 live: restricted-v2, uid 1000730000, RO root. No secrets in layers: IMG 2 context probe (planted secret files are rejected) | PASS |
| IMG-4 Reproducible inputs | `Containerfile:20` `npm ci`; restore against `Directory.Packages.props`; `.containerignore` (bin/obj/node_modules/.git/.env*/kubeconfig); IMG 2 context probe | PASS |

## Hosting in production mode (HOST)

| AC | Evidence | Verdict |
|---|---|---|
| HOST-1 SPA fallback, /api never | BE `Hosting/SpaHostingTests.Get_SpaRoute_ReturnsIndexHtml_NotCached` (deep link), `UnknownApiPath_Returns404ProblemDetails_NeverIndexHtml` (`/api/nope`, `/API/nope`, `/api`, POST), `NonGetToSpaRoute_Returns404…`, `Probes_AreNeverAnsweredByTheFallback`; IMG 6 | PASS |
| HOST-2 Caching | BE `Get_IndexHtmlDirectly_IsNotCached`, `Get_SpaRoute_…NotCached`, `Get_HashedAsset_IsImmutable`, `Get_MissingAsset_Returns404`; IMG 6 `no-cache` | PASS |
| HOST-3 CSP everywhere, Monaco works | BE `Http/SecurityHeadersTests.Production_Get_CarriesAllHeaders` (SPA, asset, API, probe), `CsrfRejection_403…`, `UnhandledException_500…`, `ProxiedKubernetesResponse_UpstreamSecurityHeaders_AreOverwritten`, `Middleware_Csp_Equals_The_Adr_Contract`; e2e `csp.e2e.ts` (YAML tab + editor worker, no violations); H2 live headers. T-0092 done | PASS |
| HOST-4 Secure cookie behind edge, redirect_uri from PublicOrigin | BE `ProductionConfigurationTests.Login_OverPlainHttp_SetsOnlySecureCookies`, `SessionCookie_IsSecureHttpOnlyLax`, **(QA)** `Login_RedirectUri_IgnoresForwardedHeaders` (X-Forwarded-Host/Proto/Prefix, Forwarded, Host spoofed → still `https://console.invalid/api/auth/callback`); `AuthEndpointsTests.Login_Redirects…ConfiguredRedirectUri`; H2 live cookie `secure; httponly; samesite=lax` | PASS |
| HOST-5 No URL/code in logs, JSON stdout | BE `Hosting/ProductionLoggingTests.OAuthCallbackUrl_NeverReachesTheLogs_EvenAtTrace`, `ConsoleLogger_UsesJsonFormatter_WithUtcTimestamps_AndNoScopes`; IMG 8; H5 live 0 matches | PASS |
| HOST-6 Fail fast, one line, key only | BE `ProductionConfigurationTests.MissingRequiredSetting_…NamingTheKeyOnly` (origin, DB), `SeveralInvalidOptionsTypes_…`; `Persistence/DataProtectionSetupTests.InvalidCertificateConfiguration_…NamingTheKey` (8 rows), `WithoutCertificate_OutsideDevelopment_…`; `Identity/OpenShiftIdentityRegistrationTests.InvalidOptions_StopStartup` (OAuth client, CA bundle), `GarbageCaBundle_StopsStartup_WithAKeyOnlyMessage`; IMG 7 (exit 1, one line per key, no stack). **(QA)** manual: published Api in Production with an empty ClientSecret / ClientId / HostApiServerUrl, a missing or garbage CaBundlePath, or SkipTlsVerify=true → exit 1 and one `Startup configuration error: Auth:OpenShift:<key> …` each, 0 fake-secret matches | PASS |

## Health probes (PRB)

| AC | Evidence | Verdict |
|---|---|---|
| PRB-1 Prod probes, status only, anonymous, no CSRF | BE `Hosting/ProductionProbeTests.Probes_AreHealthy_Anonymous_WithoutCsrfHeader_StatusWordOnly` (GET/POST), `AnonymousSurfaceTests.OutsideApi_ProductionMapsOnlyTheAdr0028AnonymousEndpoints`; IMG 6 `Healthy`; H2 live | PASS |
| PRB-2 Liveness DB-independent, readiness includes DB, startup probe | BE `ProductionProbeTests.DatabaseUnreachable_AliveIs200_HealthIs503` (host already running); `K:base/deployment.yaml` startup `/alive` 2 s × 30, liveness `/alive`, readiness `/health`. **Fails (QA manual):** with the DB unreachable **at start**, the key-ring read plus EF retries block Kestrel for 61 s. That is longer than the 60 s startup budget, so the pod restarts in a loop during a DB outage | **PASS after T-0106** (acd81ed: `ProductionProbeTests` refused/dropped DB at start → `/alive` 200 in ~2 s, `/health` 503; recovers without restart. Init container retry during outage accepted, ADR-0027 amendment) |
| PRB-3 DB scaled to 0 → NotReady, no restart, recovers | Running-pod path covered by `DatabaseUnreachable_AliveIs200_HealthIs503`; H6 human 2026-11-21 | PASS |

## Configuration & secrets (CFG)

| AC | Evidence | Verdict |
|---|---|---|
| CFG-1 Env/files; ConfigMap vs Secret split | `K:base/kustomization.yaml` configMapGenerator (non-secret); `K:base/deployment.yaml` secretKeyRef `consolinho-db`, `consolinho-oauth`, Secret volume `consolinho-dp-cert`; overlays set origin/admins; DEP render | PASS |
| CFG-2 DP key ring in PG, cert from Secret, required | BE `ProductionConfigurationTests.KeyRing_IsEncryptedWithTheCertificate`; `DataProtectionSetupTests.WithCertificateAndPasswordFile_…`, `WithoutCertificate_OutsideDevelopment_FailsStartValidation`, `Rotation_KeysEncryptedWithThePreviousCertificate_StayReadable`; IMG 7 | PASS |
| CFG-3 Bootstrap admin from deploy config, default `oc whoami` | `DD:` `--admin` (header l.25, default `oc whoami`, l.73); overlays `Auth__BootstrapAdminUsers__0`; H1 printed admin | PASS |
| CFG-4 CA bundle = SA ca.crt + ingress CA; no SkipTls | `DD:` ~l.190–210 (kube-root-ca.crt + ingress CA → ConfigMap `consolinho-ca-bundle`); `Auth__OpenShift__CaBundlePath` in base; `OpenShiftIdentityRegistrationTests.SkipTlsVerify_IsAllowedOnlyInDevelopment`; H2 live: OAuth discovery/authorize worked over the bundle | PASS |
| CFG-5 No secret committed, example documents keys | `K:overlays/production/secrets.example.yaml` (REPLACE_ME only); base/overlays reference Secret names only; `.dev-generated/` gitignored; `DD:` secrets in `mktemp -d`, `--from-file`/stdin only (T-0102 stub run: no value in argv/stdout) | PASS |

## Database & migrations (DB)

| AC | Evidence | Verdict |
|---|---|---|
| DB-1 Explicit, same image, idempotent, concurrent-safe | `migrate` init container, same image (`K:base/deployment.yaml`); BE `Persistence/DatabaseMigratorTests.FreshDatabase_AppliesAllMigrations_ThenNone`, `ConcurrentRuns_BothSucceed_AndLeaveTheSchemaUpToDate`; IMG 5 (twice, exit 0/0); H5 live "applied 2 migrations" | PASS |
| DB-2 Failed migration blocks rollout, error in logs | Init container + `maxUnavailable: 0`; IMG 7b (unreachable DB → exit 1, one `Database migration failed:` line, no stack); RUNBOOK §9 row. A live failed rollout is not exercised | PASS |
| DB-3 Dev Postgres: PVC, secret, restricted-v2, probes, RH image, survives | `K:overlays/dev/postgres-statefulset.yaml` (rhel9/postgresql-16, volumeClaimTemplate 5Gi, `consolinho-postgres` Secret, readiness/liveness, runAsNonRoot); H1 second run reused secrets, rollout ok. Data surviving re-runs is proven by H4 | PASS (H4 pending) |
| DB-4 Prod: external PG, no workload | `K:overlays/production` (no StatefulSet; DEP 7 objects); RUNBOOK §4.3 | PASS |

## Kubernetes manifests (K8S)

| AC | Evidence | Verdict |
|---|---|---|
| K8S-1 base + dev/prod render, validated | DEP RENDER ×3 + KUBECONFORM | PASS |
| K8S-2 Labels, names | `K:base/kustomization.yaml` name/part-of; `component` per resource; `version` in production overlay and in the generated dev overlay (`DD:` l.246, git SHA); Deployment/Service/Route `consolinho` | PASS |
| K8S-3 Edge TLS, Redirect, HSTS, timeout ≥ 300 s | `K:base/route.yaml` edge + Redirect, `hsts_header: max-age=31536000`, `timeout: 330s`; H2 live 302→HTTPS + HSTS | PASS |
| K8S-4 Requests + memory limit on every container, maxUnavailable 0 | `K:base/deployment.yaml` migrate (50m/128Mi, 512Mi) and server (100m/256Mi, 768Mi), RollingUpdate `maxUnavailable: 0`; postgres (100m/256Mi, 1Gi) | PASS |
| K8S-5 Pod security, no SA token, no RBAC | `K:base/deployment.yaml` runAsNonRoot, RuntimeDefault, drop ALL, no privilege escalation, RO root (both containers), `automountServiceAccountToken: false` (+ SA); no RoleBinding for SA `consolinho`; H5 live | PASS |
| K8S-6 NetworkPolicy | `K:base/networkpolicy-ingress.yaml` (router policy-group, 8080); `K:overlays/dev/postgres-networkpolicy.yaml` (server pods only, 5432; migrate is an init container of those pods); egress policy DNS/5432/443/6443 | PASS |
| K8S-7 Production overlay | `images:` newName/newTag, replicas 2 patch, `pdb.yaml` minAvailable 1, no Postgres/BuildConfig, REPLACE_ME placeholders documented in RUNBOOK §4.2 | PASS |

## Dev deploy script (DEV)

| AC | Evidence | Verdict |
|---|---|---|
| DEV-1 Current context, prints target, confirms, preflight | `DD:` l.73–74 (whoami/server, abort if not logged in), l.109 `auth can-i create oauthclients`, l.115–121 print + confirm (`--yes`); H1 | PASS |
| DEV-2 Derives from live cluster | `DD:` l.74 API URL, l.124 apps domain, Route host → `Console__PublicOrigin`, ingress CA; OAuth endpoints left to the Api's discovery (allowed); H1/H2 | PASS |
| DEV-3 Namespace, overlay, in-cluster build, rollout | `DD:` project + generated overlay + `oc start-build --from-archive --follow` (l.221). `--from-archive` of `git ls-files` instead of `--from-dir` is a documented deviation (ADR-0026 §4 / ADR-0030); H1 new digest | PASS |
| DEV-4 OAuthClient | `DD:` l.281–302 (redirect `<origin>/api/auth/callback`, `grantMethod: auto`, secret from `consolinho-oauth`); H2 live: OAuth server accepts `client_id=consolinho` | PASS |
| DEV-5 Idempotent | `DD:` create-if-missing secrets (l.141/158/168/180 "reused"); H1 2nd run: "Secret … reused" ×4, new digest only. "Existing credentials still work" → H4 | PASS (H4 pending) |
| DEV-6 Fresh cluster → Ready, non-zero on failure | `DD:` l.305 `rollout status --timeout=300s` → hints + exit 1; H1 exit 0 ×2 | PASS |
| DEV-7 Summary, no secrets printed | `DD:` l.313–330 (Route URL, admin, SMK-1 steps); T-0102 stub run; H1 output | PASS |
| DEV-8 Teardown with confirmation naming the cluster | `DD:` l.92–103 (can-i delete, prints API URL, typed namespace, TTY required, `--yes` ignored) | PASS (H7, human 2026-11-21) |
| DEV-9 shellcheck, strict mode, deps in header | DEP SHELLCHECK; `set -euo pipefail`; header l.20 lists `oc, openssl, coreutils, git, tar`. git/tar are a documented deviation (ADR-0030, archive of the working tree) | PASS |

## Smoke setup (SMK)

| AC | Evidence | Verdict |
|---|---|---|
| SMK-1 Smoke SA + namespaced view RoleBinding, printed steps | `K:overlays/dev/smoke-serviceaccount.yaml`, `smoke-rolebinding.yaml` (RoleBinding → ClusterRole `view`, ns-scoped); `DD:` l.318–330 steps 1–4 (token not echoed) | PASS |
| SMK-2 Pods in `consolinho` live, YAML under CSP | Local: e2e `browse.e2e.ts`, `csp.e2e.ts`; cluster: H3 (human 2026-11-21) | PASS |
| SMK-3 Runbook widening by hand | RUNBOOK §3.2 (`cluster-reader`, cluster-scoped warning, undo before teardown) | PASS |

## Runbook (OPS)

| AC | Evidence | Verdict |
|---|---|---|
| OPS-1 Coverage | `docs/ops/RUNBOOK.md` §2 prereqs, §3 dev deploy, §4 production (§4.2 overlay, §4.4 DP cert, §4.5 secret + CA, §4.6 OAuthClient), §5 config reference, §6 upgrade/rollback (forward-only), §7 backup/restore | PASS |
| OPS-2 Key-loss warning + rotation | RUNBOOK l.7–11 WARNING callout at the top; §8, §8.1, §8.2 rotation keeping the previous cert | PASS |
| OPS-3 Troubleshooting (7 symptoms) | RUNBOOK §9 table: unavailable, redirect_uri mismatch, not_registered, lost last admin, NotReady (DB), 504 on watches, base-image pull, plus migrate and config-error rows | PASS |

## Quality gates (QG)

| AC | Evidence | Verdict |
|---|---|---|
| QG-1 BE/FE green; T-0094 | Gates above; T-0094 done (20/20 loop in its work log) | PASS |
| QG-2 Production-pipeline integration tests | `BE:Integration/Hosting/ProductionHost` (WAF, env Production, faked settings) used by SpaHosting, SecurityHeaders, ProductionLogging, ProductionProbe, ProductionConfiguration tests | PASS |
| QG-3 Image check | `scripts/check-image.sh` steps 1–8 green (random UID, RO root, throwaway Postgres, SPA, probes, DevOAuth absent) | PASS |
| QG-4 Render in a check script | `scripts/check-deploy.sh` | PASS |

## Cluster checks (H)

Orchestrator run on 2026-11-21 (OCP 4.22 sandbox, ns `consolinho`). QA had no cluster access.

| Check | Evidence | Verdict |
|---|---|---|
| H1 Deploy + re-run | `deploy-dev.sh --yes` ×2, exit 0; 2nd run "Secret … reused" ×4, rollout ok, new image digest | PASS |
| H2 HTTPS, HSTS, OAuth login, cookie | HTTP→302 HTTPS; HSTS max-age=31536000; CSP/XFO DENY/nosniff/no-referrer; `/alive`,`/health` Healthy; `/api/auth/login` → 302 to cluster OAuth authorize (client_id=consolinho, scope user:info, PKCE S256), the OAuth server accepts the client (302 → /login); `/api/auth/me` 401; correlation cookie `secure; httponly; samesite=lax`. Human 2026-11-21: interactive OAuth login, landed as bootstrap admin, cookie Secure; HttpOnly | PASS |
| H3 Smoke SMK-1/2 | Human 2026-11-21: registered host cluster, credential Test OK, grant, Pods in `consolinho` live (Postgres pod recreated), YAML under CSP | PASS |
| H4 Credential survives re-run | Human 2026-11-21: credential Test OK after re-run | PASS |
| H5 SCC / UID / RO root / clean logs | scc=restricted-v2, uid 1000730000, gid 0, readOnlyRootFilesystem=true, runAsNonRoot=true; 0 matches for `code=|bearer|password|secret` in the server log; migrate applied 2 migrations | PASS |
| H6 DB scaled to 0 | Human 2026-11-21: NotReady with no restarts, recovered on scale-up | PASS |
| H7 Teardown | Human 2026-11-21: namespace and OAuthClient removed | PASS |

## Defects

| Id | Severity | Summary |
|---|---|---|
| T-0106 | medium, non-blocking | If Postgres is unreachable at pod start, the key-ring read plus EF retries keep Kestrel unbound for 61 s, longer than the 60 s startup-probe budget, so the pod restarts in a loop until the DB returns. `/health` also takes ~58 s to return 503 (the readiness timeout of 3 s still marks the pod NotReady) |

## Risks / notes

- The PRB-3 scenario (DB lost while the pod is running) is only proven in-process. H6 must confirm that no restart
  happens, especially that the cached DP key ring doesn't trigger a blocking re-read.
- With an unreachable DB the EF retry warnings log full Npgsql stack traces at Warning. They are noisy but carry no
  secret (0 fake-secret matches).
- Kubeconform skips the Route (no schema). Route fields are checked only by review and H2.

## Product owner acceptance

**2026-11-21 · Verdict: ACCEPT-WITH-FOLLOWUPS.** 45/48 ACs PASS on QA evidence, PRB-2 included after T-0106. No AC
fails. PRB-3, DEV-8 and SMK-2 are HUMAN. **Merge condition:** the human runs H2 (interactive login as bootstrap admin),
H3, H4 (credential still tests OK after a re-run), H6 and H7. H4 is the one that matters most: it proves the DP key ring
and the certificate survive a re-run (DEV-5, DB-3).
**Day-2 review, runbook only:**
- *Deploy*: §4.3–4.7 can be followed top to bottom. Secrets never go on argv, the OAuthClient uses server-side
  apply, and there is an `openssl s_client` CA check before rollout. Good.
- *Upgrade/rollback*: §6 is forward-only, tells you to back up first, and covers `Init:Error` triage. Re-applying
  over `rollout undo` is the right call.
- *DP rotation*: §8.2 is correct and honest about the one-previous-certificate limit (already in the backlog).
- *Backup/restore*: §7 backs up the DB and certificate together and supports restoring into a new namespace.
- *Troubleshooting*: §9 covers all 7 OPS-3 symptoms plus migrate and config-error rows, each with the log line to grep.
- *Dev script on a frequently replaced cluster*: one command, and the confirmation names the API URL. Re-runs are
  idempotent, the summary works as a checklist, and teardown requires typing the namespace. Pleasant to use. The
  4 manual smoke steps after every reinstall are tedious but out of scope by design (see backlog proposal below).
**Follow-ups (later, CP6):** T-0107: `--help` prints AC/ADR ids and agent rules, so it should lead with usage and
examples. T-0108: runbook gaps (OAuth client-secret rotation, "which version is running", a §9 row for credentials
that can no longer be decrypted after restore or key loss, post-restore verification, plus a human check of the dev
`pg_dump` command).
**Proposed ROADMAP backlog lines:** the five spec §8 items (instance banner, Argo CD app, metrics + ServiceMonitor,
host-cluster self-registration, DP rotation helper) are not in ROADMAP yet. Add them, plus "(CP3 ACCEPT) `deploy-dev.sh
--register-self`: after rollout, register the host cluster + smoke credential + ReadOnly grant through the admin API,
so a reinstalled test cluster is usable in one command".
