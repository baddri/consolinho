---
id: T-0102
title: scripts/deploy-dev.sh — one-command, idempotent dev deploy to the current oc cluster (+ --teardown)
status: done
owner: backend-engineer
checkpoint: 3
depends_on: [T-0100, T-0101]
paths: [scripts/deploy-dev.sh]
review_rounds: 0
---

## Goal
Deploy `consolinho` to whatever test cluster the current `oc` login points at, deriving every cluster-specific value
live, reusing generated secrets on re-runs. Spec: DEV-1..9, SMK-1 (script part), CFG-3, CFG-4, Q6–Q9.
**Engineers never run it against a cluster** (CLAUDE.md rule 6); verification is local (see AC). The orchestrator
runs H1–H6 later.

## Contract / design notes (ADR-0030 § scripts/deploy-dev.sh, § OAuth and trust)
- Header comment: purpose, dependencies (`oc`, `openssl`, coreutils, `git`, `tar`), flags, who may run it (DEV-1
  incl. the orchestrator exception; `--teardown` human-only), what it creates. `set -euo pipefail`, no `set -x`,
  `umask 077`. Checklist output: one line per step (`✓ Namespace consolinho ready`), errors to stderr, exit ≠ 0.
- Flags: `--yes`, `--admin <user>`, `--teardown`, `-h|--help`. Namespace fixed `consolinho`.
- **Flow** (deploy):
  1. Preflight: `oc whoami` (abort "not logged in"), server = `oc whoami --show-server`, user; `oc auth can-i create
     oauthclients` must be `yes`. Print API URL, user, namespace; confirm (`[y/N]`, names the API URL) unless `--yes`.
     Warn if the admin is `kube:admin` (Q8).
  2. Derive: apps domain `oc get ingresses.config/cluster -o jsonpath='{.spec.domain}'`; host `consolinho.<domain>`;
     `PUBLIC_ORIGIN=https://<host>`.
  3. Namespace: create project if missing (`oc new-project consolinho --skip-config-write` or `oc create namespace`).
  4. Secrets, **create only if missing** (DEV-5): `consolinho-oauth` (`client-secret` = `openssl rand -hex 32`),
     `consolinho-postgres` + `consolinho-db` (same generated password; `connection-string` =
     `Host=postgres;Port=5432;Database=consolinho;Username=consolinho;Password=…`), `consolinho-dp-cert`
     (`openssl req -x509 -newkey rsa:3072 -nodes -days 3650 -subj /CN=consolinho-data-protection` →
     `openssl pkcs12 -export` with a generated password; keys `certificate.pfx`, `password`). Values written to files
     in a `mktemp -d` (removed by `trap`) and passed with `--from-file`; never in argv, never printed.
  5. CA bundle (CFG-4, Q6; on a fresh namespace wait ≤ 30 s for `kube-root-ca.crt` to appear): its `ca.crt` + `openshift-config-managed/
     default-ingress-cert` `ca-bundle.crt` → ConfigMap `consolinho-ca-bundle` key `ca-bundle.crt` via
     `oc create configmap … --dry-run=client -o yaml | oc apply -f -`; also copy to
     `${XDG_CACHE_HOME:-$HOME/.cache}/consolinho/ca-bundle.crt` for SMK-1.
  6. Build: `oc apply -k deploy/kustomize/build`; archive `git ls-files -co --exclude-standard` (skip paths that no
     longer exist) with `tar` into the temp dir; `oc start-build consolinho -n consolinho --from-archive=… --follow
     --wait`; digest reference from `oc get istag consolinho:latest -o jsonpath='{.image.dockerImageReference}'`.
  7. Generated overlay `deploy/kustomize/overlays/.dev-generated/kustomization.yaml` (rewritten each run, gitignored by
     T-0101): `resources: [../dev]`; `configMapGenerator` `consolinho-config` `behavior: merge` with
     `Console__PublicOrigin`, `Auth__BootstrapAdminUsers__0` (`--admin` or `oc whoami`); `images:` name `consolinho`
     → built reference + digest; `labels` `app.kubernetes.io/version: <git short sha>[-dirty]`
     (`includeSelectors: false`); the Route-host `replacements` stanza (copy from `overlays/dev`). `oc apply -k` it.
  8. OAuthClient `consolinho` (DEV-4): manifest via heredoc to `oc apply -f -` (secret read back from
     `consolinho-oauth` into a variable, never echoed): `grantMethod: auto`, `redirectURIs:
     [<PUBLIC_ORIGIN>/api/auth/callback]`, `scopeRestrictions: [{literals: [user:info]}]`.
  9. `oc rollout status deployment/consolinho -n consolinho --timeout=300s` (DEV-6); on failure print hints
     (`oc logs deploy/consolinho -c migrate`, `oc describe pod -l app.kubernetes.io/component=server`) and exit 1.
  10. Summary (DEV-7): Route URL, bootstrap admin, then SMK-1 steps verbatim from the spec (token command with
     `--duration=168h` and the fallback note from Q9, register with the API URL from step 1 and the CA bundle path from
     step 5, environment `dev`, add + Test credential, grant ReadOnly). Never print secrets.
- **Teardown** (DEV-8): preflight as above; confirmation names the API URL and requires typing the namespace
  (`--yes` does **not** skip it); `oc delete oauthclient consolinho --ignore-not-found` and `oc delete project
  consolinho --wait`; leaves the local CA cache file.
- Idempotence (DEV-5): a second run changes only the build, the generated overlay's image/version and the rollout;
  every `oc` mutation is `apply` or create-if-missing.

## Context pack
- Docs: ADR-0030 (whole), ADR-0026 §4, CP3 spec §4.7–4.8 (`grep -n 'DEV-\|SMK-' docs/specs/CP3-deploy-to-openshift.md`), §5
  UX notes (checklist output, prompt names the API URL).
- Inputs from T-0101: `deploy/kustomize/build/`, `deploy/kustomize/overlays/dev/kustomization.yaml` (Route-host
  replacements stanza to copy), Secret/ConfigMap names in ADR-0030's table. `scripts/check-deploy.sh` (renders +
  shellchecks this script).

## Acceptance criteria
- [x] DEV-9: shellcheck clean (via `scripts/check-deploy.sh`), `bash -n` ok, `--help` works without `oc` logged in.
- [x] Local dry verification with a **stub `oc`** on `PATH` (scratch dir, not committed) that answers the reads and
      logs mutations: first run creates secrets/CA/OAuthClient and applies the generated overlay; second run (stub
      reports secrets exist) creates no secret; no secret value appears in stdout/stderr or in the stub's argv log.
      Record the stub approach and results in the work log.
- [x] The generated overlay renders with `oc kustomize`/`kubectl kustomize`/`kustomize build` (Route host = derived host).
- [x] Build, lint and tests green (CLAUDE.md rule 4) — `scripts/check-be.sh --no-test` at least.

## Work log
- 2026-11-21 backend-engineer: wrote `scripts/deploy-dev.sh` per ADR-0030 flow 1–10 + `--teardown`. No cluster access used.
- 2026-11-21 verified offline: `bash -n`, `--help` with no kubeconfig, `scripts/check-deploy.sh` (shellcheck) green,
  `check-be.sh --no-test` green. Stub `oc` (scratch, not committed) logs argv, emulates secrets/project state, delegates
  only `kustomize` to the real `oc`; all assertions pass: run 1 creates 4 secrets/CA/OAuthClient, run 2 creates nothing,
  no mutation outside ns consolinho except OAuthClient, overlay renders (Route host = derived, digest pinned), no secret leak.

## Review
- 2026-11-21 backend-architect: **APPROVE** (round 1). `scripts/check-deploy.sh` green (render, kubeconform, shellcheck).
  Safety verified: `set -euo pipefail` + `umask 077`; every mutating call pinned (`-n consolinho`, or kustomizations
  `build/` and `overlays/dev` carry `namespace: consolinho`, CA ConfigMap YAML carries `-n`); OAuthClient is the only
  cluster-scoped write; `oc delete` only in `--teardown`, behind can-i + typed namespace, not skippable by `--yes`.
  Secrets create-only (`exists` errors fall through to `oc create`, which fails rather than overwrites → DP cert safe);
  values via files/stdin only. API URL/apps domain live; issuer left to Api discovery via `kubernetes.default.svc`
  (ADR-0030 Q5, DEV-2 allows it). Redirect URI and Route host share `$PUBLIC_ORIGIN`. Smoke SA/RoleBinding come from
  `overlays/dev` (SMK-1). Deviations accepted: `images:` on the transformed name (base `image: consolinho` is rewritten
  by `overlays/dev` first, so this is correct and pins both `migrate` and `server`); SSA for the OAuthClient;
  build log in the cache dir.
  Optional:
  - scripts/deploy-dev.sh:99 — teardown prompt accepts piped stdin, so an agent could script it — consider
    `[[ -t 0 ]] || die "--teardown needs an interactive terminal"` to enforce "human-only".
  - scripts/deploy-dev.sh:313 — a failing `oc get route` after a successful rollout exits non-zero without a ✗ line —
    append `|| true` (fallback `$HOST` already exists).
  - scripts/deploy-dev.sh:284 — `--force-conflicts` would silently take over a pre-existing unrelated OAuthClient
    `consolinho`; consider warning if it exists without label `app.kubernetes.io/part-of=consolinho`.

## Handover notes
- **Deviation (images):** generated overlay's `images:` entry matches `image-registry.openshift-image-registry.svc:5000/
  consolinho/consolinho` (the dev overlay's `newName`), not `consolinho`: kustomize matches the already-transformed name;
  with `name: consolinho` the render kept `:latest` (verified). `newName` + `digest` come from the istag reference.
- OAuthClient uses `oc apply --server-side --force-conflicts` so the secret is not copied into the
  last-applied-configuration annotation (still `apply`, idempotent).
- Build log goes to `${XDG_CACHE_HOME:-~/.cache}/consolinho/build.log` (tail printed on failure) to keep checklist output.
- Teardown also checks `can-i delete oauthclients`; `--yes` never skips the type-the-namespace prompt.
- Secret files are written without trailing newline (Postgres env / connection string safe); pg and db secrets share
  one password, rebuilt from whichever exists if only one is present.
- Orchestrator H1: run `scripts/deploy-dev.sh --yes` after checking `oc whoami --show-server`; run twice for DEV-5.
- orchestrator: applied optional nits L99 (`-t 0` for teardown) and L313 (`|| true`); L284 label check left as follow-up.
