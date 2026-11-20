---
id: T-0103
title: docs/ops/RUNBOOK.md — dev and production deploy, upgrade/rollback, backup/restore, key loss, troubleshooting
status: todo
owner: backend-engineer
checkpoint: 3
depends_on: [T-0101]
paths: [docs/ops/RUNBOOK.md, README.md]
review_rounds: 0
---

## Goal
One operator-facing runbook for running `consolinho` on OpenShift. Spec: OPS-1, OPS-2, OPS-3, SMK-3, DB-4, Q1, Q9.
Can run in parallel with T-0102: the script's flags and behaviour are fixed in ADR-0030 / T-0102's contract; check the
final script before moving to `in_review` and align wording.

## Contract / design notes
Sections (headings stable — later docs link to them):
1. **Overview** — what gets deployed (one Deployment with `migrate` init container, Service, Route, NetworkPolicies;
   dev adds Postgres + smoke SA), link ADR-0026..0030.
2. **Prerequisites** — `oc` login with rights to create OAuthClients; tools (`oc`, `openssl`, `git`, `tar`); podman for
   local image checks.
3. **First dev deploy** — `scripts/deploy-dev.sh` usage, what it derives, re-runs (idempotent), `--teardown`
   (human-only), smoke steps SMK-1 and widening the smoke SA to `cluster-reader` by hand (SMK-3, cluster-scoped →
   human choice: `oc adm policy add-cluster-role-to-user cluster-reader -z consolinho-smoke -n consolinho`). Token
   lifetime note: `--duration=168h`; if the API server caps it, use the default (Q9).
4. **Production deploy** — copy `overlays/production`, replace placeholders (list them), external Postgres (Q1/DB-4:
   managed or DBA-run; SSL connection-string options), create Secrets/ConfigMap from `secrets.example.yaml` keys (table
   = ADR-0030 configuration contract), generate the DP certificate (same openssl commands as the script), build the
   CA bundle (kube-root-ca + OAuth route CA; it **replaces** system trust, so include a public root if the OAuth
   route uses one), create the OAuthClient (YAML with `grantMethod: auto`, redirect URI, `scopeRestrictions`), apply,
   verify.
5. **Configuration reference** — every key (env name, meaning, default, required?), mounted paths.
6. **Upgrade and rollback** — new image via `images:`; migrations run in the init container; forward-only: roll back
   the image only if the schema is compatible, otherwise restore the backup taken before upgrade.
7. **Backup and restore** — `pg_dump`/`pg_restore` (dev: `oc exec statefulset/postgres`), plus the DP certificate
   Secret. HA Postgres operators/PITR: mention only (out of scope).
8. **Data Protection keys — read this** (OPS-2, prominent warning box at the top of the document too): losing the DP
   certificate **or** the `data_protection_keys` table makes every stored SA token unreadable; back up both. Rotation:
   create a new PFX Secret, mount both, set the new one as `DataProtection__KeyEncryptionCertificatePath` and the old
   one as `DataProtection__PreviousKeyEncryptionCertificatePath` (+ password paths; ADR-0028 §6, T-0099); keep the
   old certificate configured as long as keys it encrypted remain in `data_protection_keys` (i.e. indefinitely unless
   the key ring is re-created and all SA tokens re-entered).
9. **Troubleshooting** (OPS-3) — table symptom → cause → fix: login `unavailable` (CA bundle / OAuth route trust);
   `redirect_uri` mismatch (Route host vs OAuthClient vs `Console__PublicOrigin`); `not_registered` with
   auto-provision off; lost last admin (bootstrap admin recovery via `Auth__BootstrapAdminUsers__0` + rollout);
   pod NotReady (DB, `/health`); Route 504 on long watches (`haproxy.router.openshift.io/timeout`); build fails pulling
   base images / npm / nuget (egress, proxies); `Init:Error` (migration failed: `oc logs … -c migrate`); startup exits
   with `Startup configuration error: <key>`.
- Add one line to `README.md` linking the runbook (deployment section).

## Context pack
- Docs: ADR-0026..0030; CP3 spec §4.9 and §7 (`grep -n 'OPS-\|SMK-3\|Q1 \|Q9' docs/specs/CP3-deploy-to-openshift.md`);
  `docs/dev/TROUBLESHOOTING.md` (style exemplar for the troubleshooting table — read its first section only);
  SECURITY.md § Token handling.
- Inputs: `deploy/kustomize/overlays/production/` + `secrets.example.yaml` (T-0101); `scripts/deploy-dev.sh` header
  (T-0102); the DP certificate loading in `src/FleetConsole.Infrastructure/Crypto/DataProtectionSetup.cs` (T-0099) for
  the rotation section.

## Acceptance criteria
- [ ] OPS-1..3 and SMK-3 covered; every key/name matches ADR-0030 and the rendered manifests.
- [ ] Rotation procedure true to the implemented code (T-0099).
- [ ] No real hostnames, tokens or secrets; examples use `example.com`/`REPLACE_ME`.

## Work log

## Review

## Handover notes
