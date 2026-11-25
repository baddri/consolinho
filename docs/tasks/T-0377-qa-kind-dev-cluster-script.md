---
id: T-0377
title: scripts/kind-dev.sh — local kind cluster on podman with seeded workloads, SAs and docs; record kind discovery fixture
status: todo
owner: qa-engineer
checkpoint: 5.5
depends_on: []
paths: [scripts/kind-dev.sh, deploy/kind, README.md, docs/dev/TROUBLESHOOTING.md, web/src/mocks/k8s/fixtures/kind]
review_rounds: 0
---

## Goal
Give every agent and the human a vanilla Kubernetes cluster to develop and smoke-test against (spec CP5.5 KIND-1..4,
QG55A-2, Q3: a separate script, not an AppHost resource — kind costs ~1.5 GB RAM). Seeded so the Kubernetes UI (CP5.5b)
has realistic content and a namespaced SA that cannot list namespaces (drives NSF).

## Scope
- In: the script, declarative seed manifests, README/TROUBLESHOOTING docs, the recorded discovery fixture.
- Out: KIND-5 proxy smoke (T-0379); e2e wiring with `E2E_KIND=1` (CP5.5b); AppHost integration (out of scope).

## Contract / design notes
**Host prerequisites:** `kind` (v0.33.0 at `~/.local/bin/kind`) and rootless podman only. No host `kubectl`: every
kubectl call runs **inside the control-plane container** via
`podman exec -i fleetconsole-dev-control-plane kubectl --kubeconfig /etc/kubernetes/admin.conf …`. This also makes it
impossible for the script to touch a real cluster (CLAUDE.md rule 6) — never read `~/.kube/config` or `oc` context.

**`scripts/kind-dev.sh <command>`** (bash, `set -euo pipefail`, header comment like `scripts/deploy-dev.sh` L1-25;
exports `KIND_EXPERIMENTAL_PROVIDER=podman` itself; fails fast with a clear message if `kind`/`podman` missing):
| Command | Behaviour |
|---|---|
| `up` | Create cluster `fleetconsole-dev` from `deploy/kind/cluster.yaml` (single control-plane node, node image **pinned with `@sha256:` digest** — take the image listed for kind v0.33.0 in its release notes) unless `kind get clusters` already lists it; wait for node Ready; `kubectl apply -f -` the seed (stdin, from `deploy/kind/seed/`); wait for the Deployment rollout. Running `up` twice changes nothing (create skipped, apply reports `unchanged`). Ends by printing the `tokens` hint. |
| `down` | `kind delete cluster --name fleetconsole-dev` (no-op if absent). |
| `status` | Cluster present?, node Ready?, API URL, pods in `team-a` (`-o wide` not needed). Exit non-zero when absent. |
| `tokens` | To **stdout only**: API URL (`https://127.0.0.1:<port>` from `podman port … 6443/tcp`), the CA PEM (`/etc/kubernetes/pki/ca.crt` in the node), and a fresh `kubectl create token --duration ${KIND_TOKEN_DURATION:-24h}` for `fleet-viewer` and `team-a-editor`, each labelled. Writes no file. |

Container/cluster names are constants at the top of the script. Image tags in manifests are pinned (no `latest`),
small public images (e.g. `nginx:*-alpine`, `busybox:1.x`) with fully qualified `docker.io/…` names (podman needs them).

**Seed (`deploy/kind/seed/*.yaml`, plain manifests, applied in file-name order)** — KIND-2:
- Namespaces `team-a`, `team-b`, `fleet-system` (holds the two SAs, so team-a's SA list isn't polluted).
- In `team-a`: Deployment `web` (2 replicas, nginx) + Service `web` + Ingress `web` (`ingressClassName` unset; no
  controller needed for the object to exist); StatefulSet `db` (1 replica, busybox sleep) with a `volumeClaimTemplates`
  PVC on StorageClass `standard`; CronJob `report` (`*/5 * * * *`, busybox echo); ConfigMap `app-config`; Secret
  `app-secret` (obviously fake value, CLAUDE.md rule 5); Pod `crashloop` (busybox `sh -c "exit 1"`, restartPolicy
  Always ⇒ CrashLoopBackOff ⇒ Warning events).
- In `team-b`: one small Deployment so the namespace isn't empty.
- RBAC: SA `fleet-system/fleet-viewer` — ClusterRoleBinding to `view` plus ClusterRole `fleetconsole-namespace-reader`
  (`namespaces` get/list/watch) bound to it. SA `fleet-system/team-a-editor` — RoleBinding in `team-a` to ClusterRole
  `edit` only; must get **403 on `list namespaces`** (verify with `kubectl auth can-i list namespaces --as=system:serviceaccount:fleet-system:team-a-editor` ⇒ `no`).

**Docs (KIND-4):** README new section "Local Kubernetes cluster (kind)" after "Run everything locally": install kind,
`scripts/kind-dev.sh up|tokens|down`, RAM note, then registering it in FleetConsole: Admin › Clusters › Add — Distribution
**Kubernetes**, API URL from `tokens`, TLS **CA bundle** = printed PEM; add credentials with the two tokens; test
`team-a-editor` with inspect namespaces `team-a` (this saves them and feeds `fallbackNamespaces`, T-0375); grant to a
user. Tokens expire (`KIND_TOKEN_DURATION`) — rotate with a fresh `tokens`. TROUBLESHOOTING entry: rootless podman
needs cgroup v2 controller delegation (`/etc/systemd/system/user@.service.d/delegate.conf` with
`Delegate=cpu cpuset io memory pids`, `systemctl daemon-reload`, re-login), and how the symptom looks in `kind create` output.

**Discovery fixture (QG55A-2):** after `up`, record `GET /api` and `GET /apis` (`kubectl get --raw`, inside the node)
into `web/src/mocks/k8s/fixtures/kind/api.json` and `apis.json` (pretty-printed, unedited). Add the recording
one-liner and the node image to the README section so it can be re-recorded. CP5.5b DSC-2 consumes them.

## Context pack
- Style/header exemplar: `scripts/deploy-dev.sh` L1-25 (header comment, usage), its arg parsing for the subcommand switch.
- Existing FE discovery mock for comparison of shape: `web/src/mocks/k8s/apiServer.ts` L100-115 (`APIGroupList`).
- README anchors: `## Run everything locally` (L48), `## Tests and checks` (L147); TROUBLESHOOTING headings via `grep -n '^#'`.
- Memory note: laptop OOM risk — single node only, no extra workers; `down` documented as the way to free RAM.

## Acceptance criteria
- [ ] KIND-1: `up` on a clean host creates and seeds; second `up` is a no-op; `status`/`down` behave; only kind + podman needed.
- [ ] KIND-2: all listed objects exist; `crashloop` in CrashLoopBackOff; Warning events present; PVC Bound on `standard`.
- [ ] KIND-2: `team-a-editor` cannot list namespaces, can list pods in `team-a`; `fleet-viewer` can list namespaces.
- [ ] KIND-3: `tokens` prints URL, CA PEM, two tokens to stdout; `git status` shows no new files after running it.
- [ ] KIND-4: README + TROUBLESHOOTING sections as above.
- [ ] QG55A-2: `web/src/mocks/k8s/fixtures/kind/{api,apis}.json` checked in; no `config.openshift.io` group in them.
- [ ] `shellcheck scripts/kind-dev.sh` clean if shellcheck is available; `scripts/check-fe.sh` still green.

## Work log

## Review

## Handover notes
