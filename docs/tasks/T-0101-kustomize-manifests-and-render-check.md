---
id: T-0101
title: Kustomize base + dev/production overlays + dev build objects, NetworkPolicies, dev Postgres, render check
status: done
owner: backend-engineer
checkpoint: 3
depends_on: []
paths: [deploy/kustomize/, scripts/check-deploy.sh, .gitignore]
review_rounds: 0
---

## Goal
All OpenShift manifests for `consolinho` as kustomize (ADR-0030), renderable and checked locally without a cluster.
Spec: K8S-1..7, CFG-1, CFG-5, DB-3 (manifests), DB-4, SMK-1 (manifests), PRB-2 (probe wiring), QG-4.

## Scope
- In: `deploy/kustomize/{base,overlays/dev,overlays/production,build}`, `overlays/production/secrets.example.yaml`,
  `scripts/check-deploy.sh`, `.gitignore` entry `deploy/kustomize/overlays/.dev-generated/`.
- Out: Containerfile (T-0100), the deploy script and OAuthClient/Secrets/CA ConfigMap creation (T-0102), runbook (T-0103).

## Contract / design notes — **ADR-0030 is the spec; follow it literally** (names, keys, paths, labels, probes,
resources, Route annotations, NetworkPolicies, Postgres, smoke SA). Additional points:
- Base Deployment `consolinho`: `replicas: 1`, `revisionHistoryLimit: 5`, `serviceAccountName: consolinho`,
  `automountServiceAccountToken: false`, both containers `image: consolinho` (overlays rewrite via `images:`),
  `imagePullPolicy: IfNotPresent`. `server`: `envFrom` ConfigMap `consolinho-config`; `env` from Secrets
  (`ConnectionStrings__consoledb`, `Auth__OpenShift__ClientSecret`); mounts `/tmp` (emptyDir), `/etc/consolinho/ca`
  (ConfigMap `consolinho-ca-bundle`), `/etc/consolinho/dp` (Secret `consolinho-dp-cert`, `defaultMode: 0440`), all
  read-only except `/tmp`. `migrate`: `args: ["migrate"]`, env `ASPNETCORE_ENVIRONMENT=Production` +
  `ConnectionStrings__consoledb` only, `/tmp` emptyDir.
- Base ConfigMap literals = the non-overlay keys of the ADR-0030 table; overlays `behavior: merge` the per-deployment
  ones (`Console__PublicOrigin`, `Auth__BootstrapAdminUsers__0`).
- Route host `replacements` stanza in **each outermost kustomization** (dev, production) — see ADR-0030 for why not
  in base/component; the T-0102 generated overlay repeats it. Comment the stanza with that reason.
- Dev overlay: `namespace: consolinho`; Postgres StatefulSet/Service/NetworkPolicy; `consolinho-smoke` SA +
  RoleBinding to ClusterRole `view`; placeholders `https://consolinho.apps.dev.invalid` / `REPLACE_ME`; image
  `image-registry.openshift-image-registry.svc:5000/consolinho/consolinho:latest`.
- Production overlay: `namespace: consolinho`, `replicas: 2` patch, PDB `consolinho` (`minAvailable: 1`), images
  placeholder, ConfigMap placeholders, commented `Auth__AdminGroups__0` example, `secrets.example.yaml` (not in
  `resources`; Secrets `consolinho-db`, `consolinho-oauth`, `consolinho-dp-cert` + ConfigMap `consolinho-ca-bundle`
  with obviously fake values, e.g. `REPLACE_ME`, and a header comment pointing to the runbook).
- `build/`: ImageStream `consolinho` (`lookupPolicy.local: false`) + BuildConfig `consolinho` (binary source,
  `dockerStrategy.dockerfilePath: deploy/Containerfile`, output `ImageStreamTag consolinho:latest`, resources 500m/1Gi,
  limit 4Gi, `runPolicy: Serial`), `namespace: consolinho`.
- **`scripts/check-deploy.sh`** (shellcheck-clean, token-frugal summary like `check-be.sh`): renderer = first of
  `oc kustomize`, `kubectl kustomize`, `kustomize build`, else `podman run registry.k8s.io/kustomize/kustomize:v5.x`
  (pin a tag). Render `overlays/dev`, `overlays/production`, `build`. Assert per render: no `kind: Secret`;
  dev/production Route `spec.host` equals the host of `Console__PublicOrigin` in the rendered ConfigMap; every
  container has `resources.requests` and `resources.limits.memory`; the `consolinho` containers have
  `readOnlyRootFilesystem: true`. Then `kubeconform -strict -summary` (binary or `ghcr.io/yannh/kubeconform` via
  podman) with `-skip Route,BuildConfig,ImageStream` (OpenShift kinds; note in the script). Also runs shellcheck over the CP3
  scripts that exist (`check-deploy.sh`, `check-image.sh`, `deploy-dev.sh`; not the older check scripts) (binary or `docker.io/koalaman/shellcheck:stable` via podman). Use `awk`/`grep` on the rendered YAML;
  no `yq`/`jq` dependency.

## Context pack
- Docs: ADR-0030 (all of it), ADR-0027 (init container), ADR-0028 §2 (probe paths), CP3 spec §4.6 (`grep -n 'K8S-' docs/specs/CP3-deploy-to-openshift.md`).
- No existing manifests; `deploy/` does not exist yet. Script exemplar: `scripts/check-be.sh` (log dir under the git
  dir, summary output).
- Postgres image facts (rhel9/postgresql-16): env `POSTGRESQL_USER/PASSWORD/DATABASE`, data `/var/lib/pgsql/data`,
  port 5432, probes `/usr/libexec/check-container` and `/usr/libexec/check-container --live`.

## Acceptance criteria
- [x] K8S-1/QG-4: `scripts/check-deploy.sh` renders dev, production and build overlays and passes all assertions,
      kubeconform and shellcheck (summary in work log).
- [x] K8S-2..7, CFG-1, CFG-5, DB-3/DB-4, SMK-1 manifests match ADR-0030 (reviewer checks against the rendered output).
- [x] No secret values anywhere in `deploy/` (only Secret names and the fake example).
- [ ] Build, lint and tests green (CLAUDE.md rule 4) — unaffected, run `scripts/check-be.sh --no-test` at least.
      (Not run: orchestrator forbade check-be.sh while src/ is edited concurrently; no dotnet/web files touched.)

## Work log
- 2026-11-21 backend-engineer: started; ADR-0030 as spec. Tools: oc 4.20 (kustomize v5.6.0) local; kubeconform/shellcheck via podman.
- 2026-11-21 backend-engineer: base/dev/production/build written per ADR-0030; `scripts/check-deploy.sh` added. Result:
  dev 12 objects (kubeconform Valid 11, Skipped 1 Route), production 8 (Valid 7, Skipped 1), build 2 (Skipped 2),
  shellcheck ok, DEPLOY CHECK ok. Negative tests (missing mem limit, rofs false, no replacements, Secret) all FAIL as
  expected; podman kustomize fallback renders byte-identical to `oc kustomize`.

## Review
- 2026-11-21 backend-architect — round 1: **APPROVE**. Reviewer ran `scripts/check-deploy.sh` and got DEPLOY CHECK ok
  (dev 12, prod 8, build 2; kubeconform 0 invalid; shellcheck ok). Checked the dev and production renders against
  ADR-0030: names, ConfigMap keys, Secret refs, mounts, probes, resources, securityContext, Route annotations/TLS,
  NetworkPolicies, PDB, smoke RBAC and labels all match. No secret values are committed.
- Decisions: `registry.redhat.io/rhel9/postgresql-16:latest` is accepted. The image name pins the major version, the
  image is dev-only and minor updates are PVC-compatible, so no tag pin is needed. The `check-be.sh --no-test` AC is
  waived because this task touches no dotnet or web files.
- Optional: deploy/kustomize/overlays/dev/postgres-statefulset.yaml — `serviceName: postgres` points at a ClusterIP
  (non-headless) Service. This is harmless (no per-pod DNS is used); a one-line comment would stop future "fixes".
- Optional: scripts/check-deploy.sh:22 — `SHELLCHECK_IMAGE` uses `:stable` while kustomize/kubeconform are pinned.
  Pin it (e.g. `v0.10.0`) so results are reproducible.

## Handover notes
- Labels: name/part-of (`includeSelectors: true`) in base **and** repeated in each outermost kustomization (so dev
  Postgres/smoke and the prod PDB get them); component set per resource. Production adds
  `app.kubernetes.io/version: REPLACE_ME` (`includeSelectors: false`, `includeTemplates: true`); dev leaves it to T-0102.
- Route `spec.host` comes only from the `replacements` stanza (`options.create: true`); T-0102's generated overlay must
  repeat it verbatim (see dev kustomization).
- `migrate` and `server` share the `/tmp` emptyDir (init finishes first). Postgres image `rhel9/postgresql-16:latest`
  (ADR gave no tag); headless not needed — Service `postgres` is ClusterIP, connection host `postgres`.
- Script: renderer oc > kubectl > kustomize > podman `kustomize:v5.6.0`; kubeconform v0.7.0, k8s 1.33.0 (OCP 4.20);
  podman fallbacks need network on first use. Shellchecks check-image.sh/deploy-dev.sh once T-0100/T-0102 add them.
- `check-be.sh --no-test` not run (concurrent src/ edits, per orchestrator).
