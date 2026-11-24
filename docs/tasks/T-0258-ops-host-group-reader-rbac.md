---
id: T-0258
title: Deploy — host group reader RBAC and projected SA token for the server
status: todo
owner: backend-engineer
checkpoint: 4.5a
depends_on: [T-0254]    # wave 2 (needs the config keys); parallel with T-0252/T-0253/T-0255
paths: [deploy/kustomize, docs/architecture/BACKEND.md, docs/architecture/SECURITY.md, README.md, docs/dev/TROUBLESHOOTING.md]
review_rounds: 0
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
- [ ] `oc kustomize` (dev and production overlays) renders the ClusterRole (only get/list groups), the binding to the app SA in the right namespace, and the volume mounted only in the server container.
- [ ] No other permission added; `automountServiceAccountToken` still false.
- [ ] Docs updated as listed; deploy note in Handover: cluster-admin needed to apply the ClusterRole on consolinho's cluster.

## Work log

## Review

## Handover notes
