---
id: T-0230
title: HPA for the consolinho Deployment (min 3 replicas), PDB and spread in base
status: done
owner: backend-engineer
checkpoint: 4c
depends_on: []          # parallel with T-0231/T-0232; T-0233 (live verify) needs this + T-0231
paths: [deploy/kustomize, scripts/check-deploy.sh, scripts/deploy-dev.sh, docs/ops/RUNBOOK.md, docs/adr/0030-openshift-manifests-and-dev-deploy.md]
review_rounds: 1
---

## Goal
Human directive 2026-11-24: "add hpa to our deployment, min replica 3". Run consolinho behind an `autoscaling/v2` HPA
(min 3) in every overlay, drop the conflicting fixed `replicas`, replace the production-only PDB, and make
`scripts/check-deploy.sh` enforce it. The design and the numbers are fixed in **ADR-0030 § Amendment (2026-11-24)**.

## Scope
- In: base HPA + PDB, Deployment edits, production overlay cleanup, check-deploy assertions, deploy-dev summary line,
  RUNBOOK updates, ADR-0030 *Workloads* bullet cross-reference.
- Out: the Data Protection first-key race (T-0231, required before the next **fresh** install — not before consolinho,
  whose key ring already exists); any app code; live verification (T-0233).

## Contract / design notes
- `deploy/kustomize/base/hpa.yaml` (add to base `resources:`):
  `apiVersion: autoscaling/v2`, `kind: HorizontalPodAutoscaler`, name `consolinho`, label
  `app.kubernetes.io/component: server`; `scaleTargetRef {apiVersion: apps/v1, kind: Deployment, name: consolinho}`;
  `minReplicas: 3`, `maxReplicas: 6`; `metrics: [{type: Resource, resource: {name: cpu, target: {type: Utilization,
  averageUtilization: 75}}}]` (CPU only — reasons in the ADR; say so in a YAML comment);
  `behavior.scaleUp {stabilizationWindowSeconds: 60, selectPolicy: Max, policies: [{type: Pods, value: 2, periodSeconds: 60}]}`,
  `behavior.scaleDown {stabilizationWindowSeconds: 600, policies: [{type: Pods, value: 1, periodSeconds: 300}]}`.
- `deploy/kustomize/base/pdb.yaml` (moved from production): `policy/v1` PDB `consolinho`, `maxUnavailable: 1`,
  selector `app.kubernetes.io/component: server` (kustomize adds name/part-of). Delete `overlays/production/pdb.yaml`
  and its `resources:` entry.
- `base/deployment.yaml`: remove `spec.replicas` (comment: the HPA owns it, ADR-0030 amendment); pod spec gets
  `topologySpreadConstraints: [{maxSkew: 1, topologyKey: kubernetes.io/hostname, whenUnsatisfiable: ScheduleAnyway,
  labelSelector: {matchLabels: {app.kubernetes.io/name: consolinho, app.kubernetes.io/component: server}},
  matchLabelKeys: [pod-template-hash]}]` (write the labels explicitly — kustomize does not inject them here);
  `server` gets `lifecycle: {preStop: {sleep: {seconds: 5}}}`. Keep the existing requests (100m/256Mi, migrate
  50m/128Mi); update the "Sized for one replica" comment to the HPA reasoning (CPU request = HPA denominator).
- `overlays/production/kustomization.yaml`: delete the `/spec/replicas` JSON patch; fix the header/comments.
- `scripts/check-deploy.sh` — new assertions on `overlays/dev` and `overlays/production` renders (awk over the
  normalised output, same style as `containers_report`; no yq/jq):
  1. exactly one `HorizontalPodAutoscaler` `consolinho` with `apiVersion: autoscaling/v2`, `scaleTargetRef.kind:
     Deployment`, `scaleTargetRef.name: consolinho`, `minReplicas` ≥ 3, `maxReplicas` ≥ `minReplicas`;
  2. the `Deployment` `consolinho` has no `spec.replicas` (line `  replicas:` at 2-space indent inside `spec:`);
  3. a `PodDisruptionBudget` `consolinho` exists.
  Output stays one `FAIL:` line per broken invariant; add a `HPA: <render> ok (min=3 max=6)` summary line. kubeconform
  (K8s 1.33 schemas) already validates HPA v2, PDB and `preStop.sleep`.
- `scripts/deploy-dev.sh`: no flow change (`oc rollout status` works with an HPA). Add `oc get hpa consolinho` replicas
  (current/desired) to the summary block. Must still pass shellcheck.
- `docs/ops/RUNBOOK.md`: §1 overlay description (L33: "2 replicas and a PDB (minAvailable: 1)" → HPA 3–6 + PDB
  maxUnavailable 1 in base, both overlays); backup/restore (≈L336, L368–376): `--replicas=0` still pauses (HPA ignores a
  target at 0), restore with `--replicas=3`; new "Upgrading to the HPA" note with the one-time step
  `oc apply view-last-applied deployment/consolinho -n consolinho -o json | jq 'del(.spec.replicas)' | oc apply set-last-applied -f -`
  before applying (else apply resets replicas to 1 until the HPA acts); the Postgres rule
  `maxReplicas x Maximum Pool Size + 5 ≤ max_connections`; prerequisite: cluster metrics (built into OpenShift).
- ADR-0030 *Workloads* `Resources` bullet: append "(scaling: see Amendment 2026-11-24)". The amendment itself is
  written; correct it only if implementation proves a detail wrong (tell the reviewer).

## Context pack
- Docs: ADR-0030 § Workloads + § Amendment (2026-11-24); BACKEND.md § Hosting & deployment.
- Exemplars: `deploy/kustomize/overlays/production/pdb.yaml` (PDB shape to move); `scripts/check-deploy.sh:containers_report`
  (awk style) and the render/assert loop (~L109–140, `fail`, `RENDER:` lines).
- Touch points: `deploy/kustomize/base/deployment.yaml` L9 (`replicas: 1`), L106–113 (resources comment),
  `base/kustomization.yaml` `resources:`; `overlays/production/kustomization.yaml` `patches:` + `resources:`;
  `scripts/deploy-dev.sh` summary block (~L313); `docs/ops/RUNBOOK.md` L33, L336, L368–376.

## Acceptance criteria
- [x] Both overlays render an HPA (autoscaling/v2, min 3, max 6, CPU 75 %, behavior as above), a base PDB
      (`maxUnavailable: 1`), topology spread and preStop sleep; no `spec.replicas` anywhere on the Deployment.
- [x] `scripts/check-deploy.sh` green; it FAILs (verify by a temporary local edit, then revert) when `replicas:` is
      re-added, when `minReplicas: 2`, and when the HPA is removed.
- [x] `scripts/deploy-dev.sh` passes shellcheck; generated overlay still renders (it consumes base via overlays).
- [x] RUNBOOK and ADR-0030 consistent with the manifests (no leftover "2 replicas"/`minAvailable` text).
- [x] Build, lint and tests green (CLAUDE.md rule 4): `scripts/check-deploy.sh` (+ `scripts/check-be.sh` unaffected).

## Work log
- 2026-11-24 backend-engineer: base `hpa.yaml` + `pdb.yaml` (moved, now `maxUnavailable: 1`), Deployment without
  `replicas`, spread + preStop sleep; production patch/PDB removed. `check-deploy.sh`: `scaling_report` awk + HPA/
  replicas/PDB asserts (dev, production). deploy-dev summary shows HPA replicas. RUNBOOK §1/2/4.3/4.7/6/7, ADR-0030
  (Resources bullet + the `overlays/production/` bullet, which still said "replicas 2 + PDB minAvailable"). Gate green;
  FAILs verified for `replicas:` re-added, `minReplicas: 2`, HPA removed, PDB removed (edits reverted).
- 2026-11-24 backend-engineer (round 1 fix): dev Postgres StatefulSet env `POSTGRESQL_MAX_CONNECTIONS: "650"` (6 x 100 + 5
  = 605 ≤ 650, RUNBOOK rule); reaches the existing consolinho without touching the reused `consolinho-db` Secret.

## Review
Round 1 (backend-architect, 2026-11-24): **CHANGES_REQUESTED** — `scripts/check-deploy.sh` green (HPA ok on both renders,
kubeconform + shellcheck ok). Manifests, check asserts, RUNBOOK/ADR text match the contract.
1. deploy/kustomize/overlays/dev/postgres-statefulset.yaml:28 + scripts/deploy-dev.sh:170 — our own dev default breaks
   the rule this task introduces (RUNBOOK "Connections", hpa.yaml:3): the RHEL postgresql-16 image defaults to
   `max_connections` 100 and the dev connection string has the default pool of 100, so 6 x 100 + 5 = 605 > 100 — fix
   so dev satisfies it on the *existing* consolinho too (the `consolinho-db` Secret is reused, so a connection-string
   change alone won't reach it): e.g. env `POSTGRESQL_MAX_CONNECTIONS: "650"` on the dev StatefulSet with a comment
   pointing at the rule; optionally also `Maximum Pool Size=…` in new dev strings and `secrets.example.yaml:13`.
- Answers (no change needed): deploy-dev applies the Deployment with client-side `oc apply -k` (L278; the SSA at L285
  is only the OAuth Secret). First apply after this change prunes `replicas` from last-applied → live 1 stays 1, HPA
  scales to 3; later runs no longer touch `replicas`, so no drop to 1. Production step documented in RUNBOOK §4.7.
- Single-node dev: spread is `ScheduleAnyway` (soft, all 3 co-locate fine); PDB `maxUnavailable: 1` lets a drain
  proceed one pod at a time; `preStop.sleep` (beta-on since K8s 1.30) and `matchLabelKeys` are supported on
  OCP ≥ 4.20 (K8s 1.33, our kubeconform target). 5 s + 30 s grace is sane.

## Handover notes
- Design per ADR-0030 Amendment, no deviation; the amendment text proved accurate (not edited). Only extra touch: the
  ADR's `overlays/production/` bullet got a "(superseded …)" cross-reference to satisfy the no-leftover-text AC.
- `check-deploy.sh` asserts only on `ROUTE_RENDERS` (dev, production); `build` has no Deployment. Writes
  `<render>.scaling` next to each render for debugging. It does not assert the HPA `behavior`/metric values
  (kubeconform validates shape; numbers reviewed by eye in the render).
- RUNBOOK §4.7 has the one-time `set-last-applied` step; dev (consolinho, 1 replica today) needs nothing, the HPA
  scales it to 3 after apply. Restore/rollback now end with `--replicas=3`.
- `scripts/check-be.sh` not run: no `src/` change here, and T-0231 is mid-flight in `src/`.
- Not applied to any cluster (T-0233 verifies live, after T-0231).
