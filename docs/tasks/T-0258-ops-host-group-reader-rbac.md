---
id: T-0258
title: Deploy — host group reader RBAC and projected SA token for the server
status: done
owner: backend-engineer
checkpoint: 4.5a
depends_on: [T-0254]    # wave 2 (needs the config keys); parallel with T-0252/T-0253/T-0255
paths: [deploy/kustomize, docs/architecture/BACKEND.md, docs/architecture/SECURITY.md, README.md, docs/dev/TROUBLESHOOTING.md]
review_rounds: 1
---

## Goal
In-cluster, FleetConsole can `get/list groups.user.openshift.io` on the host with its own ServiceAccount and nothing
more (ADR-0034 §5, ADR-0039 §5), so the Groups page, picker and revalidation work on consolinho.

## Scope
- In: kustomize base RBAC + projected token volume, overlay notes for an off-host deployment, doc updates.
- Out: Redis (CP4.5b); app code (T-0254 reads the token file).

## Contract / design notes
- `base/rbac-group-reader.yaml`: `ClusterRole` `consolinho-group-reader` — rules: `apiGroups: [user.openshift.io]`,
  `resources: [groups]`, `verbs: [get, list]`; `ClusterRoleBinding` to SA `consolinho` in the deploy namespace (use the
  kustomize namespace transformer; check that `namespace:` is set in `base/kustomization.yaml`). Cluster-scoped →
  applying needs cluster-admin once; say so in a manifest comment and README deploy section.
- `base/serviceaccount.yaml`: keep `automountServiceAccountToken: false`; rewrite the comment (the app now calls the
  host with its own identity, for group reads only).
- `base/deployment.yaml`: projected volume `host-sa-token` (`serviceAccountToken`, `expirationSeconds: 3600`, `path:
  token`) mounted read-only **only in the server container** at `/var/run/secrets/fleetconsole/host` (= default
  `Auth:HostGroups:TokenPath`). No env needed for the default.
- Egress NetworkPolicy: verify the host API server is already allowed (login uses it); no change expected.
- Off-host deployment (host ≠ deploy cluster): document in `overlays/production/secrets.example.yaml` a Secret with a
  host SA token mounted at the same path (replace the projected volume via a patch), with the same ClusterRole on the host.
- Docs: `SECURITY.md` §Token handling — one bullet: FleetConsole's own host SA token (projected, rotates, read per
  refresh, scope = list groups); `BACKEND.md` §Hosting & deployment — the RBAC and `Auth:HostGroups:*` keys;
  `TROUBLESHOOTING.md` — "Groups page says it can't list groups" → missing ClusterRoleBinding.

## Context pack
- Docs: ADR-0039 §5; `BACKEND.md` §Hosting & deployment (L281-300); `SECURITY.md` §Token handling (L58-79).
- Touch points: `deploy/kustomize/base/{serviceaccount,deployment,kustomization,networkpolicy-egress}.yaml`,
  `deploy/kustomize/overlays/production/secrets.example.yaml`.
- Never apply to a real cluster (CLAUDE.md rule 6); validate with `oc kustomize deploy/kustomize/overlays/dev | grep -n ...`.

## Acceptance criteria
- [x] `oc kustomize` (dev and production overlays) renders the ClusterRole (only get/list groups), the binding to the app SA in the right namespace, and the volume mounted only in the server container.
- [x] No other permission added; `automountServiceAccountToken` still false.
- [x] Docs updated as listed; deploy note in Handover: cluster-admin needed to apply the ClusterRole on consolinho's cluster.

## Work log
- 2026-11-24 backend-engineer: started; read ADR-0039 §5, T-0254 handover, base + overlays.

- 2026-11-24 backend-engineer: base `rbac-group-reader.yaml` (ClusterRole get/list groups + CRB; subject ns from overlay
  `namespace:`, verified with a foreign ns), projected `host-sa-token` in server only, SA comment; off-host Secret + SMP
  patch (tested) in production example. Egress unchanged (443/6443 already allowed). Outside paths: RUNBOOK §1 table +
  §2 prerequisites (said "no RBAC" — would be false); README has no deploy section, so untouched. check-deploy + check-be ok.

## Review
- 2026-11-24 backend-architect, round 1: **APPROVE**. Verified: ClusterRole = get/list `groups.user.openshift.io`
  only; CRB subject renders `consolinho/consolinho` in dev + prod (namespace transformer); `host-sa-token` mounted in
  `server` only, not `migrate`; `automountServiceAccountToken: false` kept; egress unchanged; EventId 3321,
  `DevOAuth:GroupsReaderToken`, `Auth:HostGroups:*` defaults match code. check-deploy + check-be pass.
  RUNBOOK edits (outside paths) accepted — they kept §1/§2 true. Reviewer fix: RUNBOOK §3 teardown now says the
  cluster-scoped objects survive. Follow-up filed: T-0268 (teardown deletes them; preflight `can-i create clusterrolebindings`).
- Optional: off-host deployments keep an unused group-read right on the deploy cluster unless they `$patch: delete` it
  (documented in secrets.example.yaml) — acceptable.

## Handover notes
- **Human step (consolinho, cluster-admin once):** `oc login` as cluster-admin, then re-run `scripts/deploy-dev.sh`
  (its `oc apply -k` now creates ClusterRole + ClusterRoleBinding `consolinho-group-reader`). Verify read-only:
  `oc auth can-i list groups.user.openshift.io --as=system:serviceaccount:consolinho:consolinho` → `yes`.
- Objects: `deploy/kustomize/base/rbac-group-reader.yaml`; volume `host-sa-token` (projected, 3600 s) at
  `/var/run/secrets/fleetconsole/host` in container `server` only; no env (default `Auth:HostGroups:TokenPath`).
- Cluster-scoped names are fixed: a 2nd deployment on one cluster must rename both in its overlay.
- Off-host: `overlays/production/secrets.example.yaml` last object + strategic-merge patch (`projected: null`).
- Follow-up (out of paths): `scripts/deploy-dev.sh --teardown` deletes the namespace but leaves the cluster-scoped
  ClusterRole/Binding; it could also preflight `oc auth can-i create clusterrolebindings`.
