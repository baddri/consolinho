---
id: T-0103
title: docs/ops/RUNBOOK.md — dev and production deploy, upgrade/rollback, backup/restore, key loss, troubleshooting
status: done
owner: backend-engineer
checkpoint: 3
depends_on: [T-0101]
paths: [docs/ops/RUNBOOK.md, README.md]
review_rounds: 1
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
- [x] OPS-1..3 and SMK-3 covered; every key/name matches ADR-0030 and the rendered manifests.
- [x] Rotation procedure true to the implemented code (T-0099): current + previous loaded by `KeyEncryptionCertificates`, previous decrypt-only.
- [x] No real hostnames, tokens or secrets; examples use `example.com`/`REPLACE_ME`.

## Work log
- 2026-11-21 backend-engineer: in_progress → in_review. Wrote `docs/ops/RUNBOOK.md` (9 stable sections + top key-loss
  warning) from ADR-0026..0030, committed manifests, T-0099/T-0100/T-0102 contracts and current auth code.
  README.md link NOT added: orchestrator restricted scope to `docs/ops/**` + this file (follow-up, one line).
  Rotation: previous cert goes into the same Secret `consolinho-dp-cert` (keys `previous-certificate.pfx`/
  `previous-password`, matching the production overlay comment) instead of a second Secret + volume patch.
- 2026-11-21 reconciled with landed T-0099/T-0100/T-0102 (984b2bb, 4b1a5f6, 584cc8b): script flags/output/teardown TTY
  + build log; base images `:9.9`, `check-image.sh`; OAuthClient now `--server-side` (secret not in annotation); RSA
  key, `:`-form error messages, advisory lock, create-if-missing DB, migrate ~60 s failure; README link added.
- 2026-11-21 review round 1 fixes: client-secret without trailing newline; rotation Secret via `--server-side
  --force-conflicts` (why stated); umask/private-dir block at the start of §4.3, connection string written with an
  editor; optional items done (steps 3+4 back to back; restore loses data since backup + fresh dump first). → in_review.

## Review
**2026-11-21 backend-architect — CHANGES_REQUESTED** (round 1; docs only, checked against manifests, deploy-dev.sh, check-image.sh, Crypto/*)
1. docs/ops/RUNBOOK.md:202 — `openssl rand -hex 32 > client-secret` keeps the trailing newline: Secret `consolinho-oauth` gets `…\n` (env via secretKeyRef, `ClientSecret` not trimmed, OpenShiftOAuthOptionsSetup.cs:50) while §4.6 `"$(cat client-secret)"` strips it → OAuthClient secret mismatch, every login fails at token exchange — pipe through `| tr -d '\n'` as deploy-dev.sh:143 does.
2. docs/ops/RUNBOOK.md:402-405 — rotation uses `--dry-run=client -o yaml | oc apply -f -` on a Secret: client-side apply copies both PFX files + passwords into `kubectl.kubernetes.io/last-applied-configuration`, which `oc describe secret` prints — use `oc apply --server-side --force-conflicts --field-manager=consolinho-operator -f -` (or `| oc replace -f -`) and say why, like §4.6.
3. docs/ops/RUNBOOK.md:172-179 — the first secret file (`connection-string`, then `client-secret`) is written before the "private directory / umask 077" advice and with the real password typed into a `printf` (shell history) — move the `umask 077; mkdir -p …; cd …` block to the start of §4.3 (it covers §4.3–4.6) and tell the operator to write `connection-string` with an editor; keep printf only with `REPLACE_ME`.
Optional:
- RUNBOOK.md:400-413 — say to run steps 3 and 4 back-to-back: a pod restarting in between loads the new cert as current without a previous one, so old tokens are unreadable until step 4 (no data loss).
- RUNBOOK.md:330, 360-364 — note that restoring loses data written since the backup, and suggest a fresh `pg_dump` of the current state before `pg_restore --clean`.
Verified OK: object/Secret/key names, mount paths + `0440`, base ConfigMap defaults, egress ports, Route 330 s, PDB, script flags (`--admin=`), teardown TTY/can-i, `:9.9` images, `REVISION` arg, `--no-build`, DP password newline trim, RSA check, Previous decrypt-only, production path independent of the script, top warning box.
Agree with the engineer's backlog item: "DP: support a list of previous key-encryption certificates (`DataProtection__PreviousKeyEncryptionCertificates__N__{Path,PasswordPath}`, all decrypt-only) or a re-wrap command that re-encrypts all `data_protection_keys` under the current certificate, so repeated rotations never orphan keys; update RUNBOOK §8.2."

## Handover notes
- Reconciled with the landed code of T-0099 (DP cert + rotation, validation messages, migrate mode), T-0100
  (Containerfile `ubi9/*:9.9`, `check-image.sh`) and T-0102 (`deploy-dev.sh` flags, output, interactive-only teardown).
  The rotation AC is now ticked.
- Rotation deviation: the previous certificate goes into the same Secret `consolinho-dp-cert` (`previous-certificate.pfx`/
  `previous-password`, as the production overlay comment shows), not a second Secret. Same effect, no Deployment patch.
- Limitation: the code supports only ONE previous certificate, so a second rotation orphans the oldest keys. The
  runbook warns. Backlog idea: a list of previous certificates, or re-wrapping keys under the new certificate.
- Production OAuthClient example uses `oc apply --server-side`, like the script, because a plain `oc apply` would store
  the client secret in the last-applied annotation.
- Unverified without a cluster (check during H1–H6): OAuth error text on redirect_uri mismatch (§9), `oc create token`
  behaviour when the duration is capped (§3.1), dev `pg_dump`/`pg_restore` via `oc exec statefulset/postgres` (§7).
- README: one line under "Further reading" (README has no deployment section).
- 2026-11-21 orchestrator: round-1 fixes verified (tr -d newline, server-side apply in rotation, umask block first). APPROVE.
