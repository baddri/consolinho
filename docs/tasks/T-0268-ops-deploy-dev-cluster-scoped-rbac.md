---
id: T-0268
title: deploy-dev.sh — preflight and teardown for the cluster-scoped group-reader RBAC
status: todo
owner: backend-engineer
checkpoint: 4.5a
depends_on: [T-0258]
paths: [scripts/deploy-dev.sh, docs/ops/RUNBOOK.md]
review_rounds: 0
---

## Goal
Since T-0258 the base renders the cluster-scoped ClusterRole/ClusterRoleBinding `consolinho-group-reader`. The dev
script should fail fast when the user can't create them (instead of `oc apply -k` dying half-applied), and
`--teardown` must remove them: a binding left behind would grant group-read to any later `consolinho/consolinho` SA.

## Scope
- In: `scripts/deploy-dev.sh` preflight + teardown; RUNBOOK §2/§3 teardown wording.
- Out: manifests (T-0258), production overlay.

## Contract / design notes
- Preflight next to the OAuthClient check (`deploy-dev.sh` ~L109): `oc auth can-i create clusterrolebindings.rbac.authorization.k8s.io`
  (and `clusterroles`) must be `yes`, else `die` with the RUNBOOK §2 hint.
- Teardown (~L92-L100): extend the `can-i delete` preflight to clusterrolebindings/clusterroles; delete
  `clusterrolebinding,clusterrole consolinho-group-reader --ignore-not-found` before deleting the project; one `✓` line.
- RUNBOOK §3 teardown paragraph: replace the "survive it (until T-0268)" sentence with what teardown now deletes.
- Never run the script against a cluster (CLAUDE.md rule 6, DEV-8); validate with `scripts/check-deploy.sh` (shellcheck).

## Context pack
- Touch points: `scripts/deploy-dev.sh` teardown block (~L90-L105), OAuthClient preflight (~L109);
  `docs/ops/RUNBOOK.md` §2 prerequisites, §3 "Teardown (humans only)" (~L86).
- Objects: `deploy/kustomize/base/rbac-group-reader.yaml`.

## Acceptance criteria
- [ ] Deploy preflight refuses early without `create clusterrolebindings`/`clusterroles`.
- [ ] `--teardown` deletes both cluster-scoped objects (idempotent) and checks the delete rights first.
- [ ] RUNBOOK accurate; `scripts/check-deploy.sh` passes.

## Work log

## Review

## Handover notes
