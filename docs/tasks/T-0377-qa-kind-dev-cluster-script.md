---
id: T-0377
title: scripts/kind-dev.sh — local kind cluster on podman with seeded workloads, SAs and docs; record kind discovery fixture
status: done
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
- [x] KIND-1: `up` on a clean host creates and seeds; second `up` is a no-op; `status`/`down` behave; only kind + podman needed.
- [x] KIND-2: all listed objects exist; `crashloop` in CrashLoopBackOff; Warning events present; PVC Bound on `standard`.
- [x] KIND-2: `team-a-editor` cannot list namespaces, can list pods in `team-a`; `fleet-viewer` can list namespaces.
- [x] KIND-3: `tokens` prints URL, CA PEM, two tokens to stdout; `git status` shows no new files after running it.
- [x] KIND-4: README + TROUBLESHOOTING sections as above.
- [x] QG55A-2: `web/src/mocks/k8s/fixtures/kind/{api,apis}.json` checked in; no `config.openshift.io` group in them.
- [x] `shellcheck scripts/kind-dev.sh` clean if shellcheck is available; `scripts/check-fe.sh` still green.

## Work log
- 2026-11-26 qa: script + `deploy/kind/{cluster.yaml,seed/00..30}` + README/TROUBLESHOOTING + fixtures. Node image from kind v0.33.0 default (`kindest/node:v1.37.0@sha256:a1ed56cf…`).
- Incident: first `up` let kind merge `kind-fleetconsole-dev` into ~/.kube/config and switch current-context. Restored to `default/api-acm-bri-poc-sandbox2014-opentlc-com:6443/kube:admin` (last `oc login` in history) and removed the kind entries. No cluster calls were made. The script now passes a mktemp `--kubeconfig`/`KUBECONFIG`, verified by md5 over the full cycle.
- Verified on a clean host: down → status (exit 1) → up (19 created) → up (all `unchanged`) → status → down. Secret uses `data` and STS VCT spells out the defaults, so re-applies are no-ops. RBAC can-i no/yes/yes; PVC Bound on standard; BackOff Warning events seen; `tokens` leaves git status unchanged.
- shellcheck v0.10.0 (container) clean; check-fe green (1584 tests). Cluster is `down` at the end.
- 2026-11-26 qa, review round 1: `up` now starts a stopped node and waits for /readyz; `status`/`tokens` exit 1 with a hint when the node is stopped. kind errors are shown, not read as "absent". The temp kubeconfig is created only for real commands. Added the headless Service `db` and a README line. Ran bash -n and shellcheck (clean), then live: up → podman stop → status/tokens exit 1 → up (restart, all unchanged) → down. ~/.kube/config md5 unchanged.
- Finding: a restarted node gets a new random API port, so the registered URL breaks (README now says so). Follow-up: pin `apiServerPort` in cluster.yaml.
- 2026-11-26 qa: pinned `apiServerPort: 16443` in cluster.yaml (`KIND_API_PORT` overrides via a rendered temp copy). `up` fails clearly on a taken port or a non-numeric value. README updated. bash -n and shellcheck clean. Live: port-taken/bad value exit 1; up → tokens shows :16443 → down. ~/.kube/config unchanged.

## Review
**Round 1 — backend-architect, 2026-11-26: CHANGES_REQUESTED** (static review + `bash -n`; `up` not run per instructions)

Safety verified: `KUBECONFIG` is exported to a 0600 mktemp at L39-41 before any kind call. `kind create`/`delete` also
get `--kubeconfig` (L72, L96). `kind export`/`get kubeconfig` are never called. All kubectl runs in the node with
`/etc/kubernetes/admin.conf` (L55). The EXIT trap also fires on SIGTERM/INT. No repo writes; `tokens` goes to stdout
only; the Secret is obviously fake. Manifests match the contract. The fixtures contain no `openshift` group. The README
and TROUBLESHOOTING sections are accurate, and the backend has no loopback-URL rejection, so `https://127.0.0.1:<port>` registers.

Required:
1. scripts/kind-dev.sh:68-75,104-107,115 — after a laptop reboot the node container is stopped, but `kind get clusters`
   still lists it. `up` then skips create, and `kc` fails with podman's raw "container is not running" (`status`/`tokens`
   fail the same way), so `up` is neither idempotent nor clear here — add a `node_running` check
   (`podman inspect -f '{{.State.Running}}' "$NODE"`). In `up`, `podman start "$NODE"` and continue into the existing
   Ready wait. In `status`/`tokens`, die with "node container stopped (run: scripts/kind-dev.sh up, or down && up if it
   doesn't recover)". Add a one-line README note.

Optional:
2. scripts/kind-dev.sh:57 — `2>/dev/null` also hides real provider errors (podman socket down), so `status` says "not
   present" and `down` says "nothing to do". Consider `kind get clusters 2>&1 | grep -qx` or check `podman info` in `require`.
3. scripts/kind-dev.sh:39-41 — mktemp/trap run even for `--help`/usage errors; could move them below arg validation. Harmless.
4. deploy/kind/seed/20-team-a.yaml:93 — `serviceName: db` has no headless Service `db`; a `clusterIP: None` Service would make the seed more realistic for the UI.

## Handover notes
- kind create/delete must always get `--kubeconfig "$KIND_KUBECONFIG"`. Without it kind silently switches the user's `oc` context (see Work log).
- The `crashloop` pod alternates Error/CrashLoopBackOff. A 60 s poll did not catch the `waiting.reason` mid-cycle, but `BackOff` Warning events (emitted only in back-off) were present.
- Fixtures: `/api` holds the node's internal `serverAddress` (10.89.x). This is unedited by design. Re-record with the README one-liner when the node image is bumped.
- T-0379 (KIND-5 smoke) can use `scripts/kind-dev.sh up && scripts/kind-dev.sh tokens`.
