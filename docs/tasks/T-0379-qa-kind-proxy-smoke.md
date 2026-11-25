---
id: T-0379
title: Proxy and connection-test smoke against kind through FleetConsole (KIND-5, CT-1/CT-2 on a real Kubernetes)
status: todo
owner: qa-engineer
checkpoint: 5.5
depends_on: [T-0375, T-0376, T-0377, T-0378]
paths: [docs/tasks/T-0379-qa-kind-proxy-smoke.md, docs/tasks]
review_rounds: 0
---

## Goal
Prove on a real vanilla Kubernetes (kind, T-0377) that the proxy features work through FleetConsole with a namespaced
SA, and that the CP5.5a changes behave on it (spec KIND-5, CT-1, CT-2, NSA-1). Manual run, recorded here; any proxy
failure is a blocker bug task (spec KIND-5).

## Scope
- In: register kind in a local `aspire start` stack, test both credentials, grant, run the smoke, record results.
- Out: automated e2e with `E2E_KIND=1` (CP5.5b); namespace-selector fallback UI (CP5.5b — use deep links).

## Contract / design notes
Setup: `scripts/kind-dev.sh up && scripts/kind-dev.sh tokens`; `aspire start --launch-profile http && aspire wait web`;
log in as the DevOAuth admin; register per README "Local Kubernetes cluster (kind)" (Distribution Kubernetes, CA bundle).
Checks, each recorded pass/fail in the Work log (≤ 5 lines per entry; screenshots only if a failure needs one):
1. Connection test `fleet-viewer`: succeeds; `detectedDistribution` kubernetes; no "List cluster operators" row (CT-1);
   no "OpenShift version" fact or step row (CT-2); headline cluster-wide view.
2. Connection test `team-a-editor` with inspect namespaces `team-a`: succeeds (Limited headline); rules shown for team-a.
3. Grant `team-a-editor` (read-write) to a test user; `GET /api/clusters` for that user shows
   `fallbackNamespaces: ["team-a"]` (NSA-1, via browser devtools or curl with the session cookie).
4. As that user, via deep links into namespace `team-a`: Pods list + live watch update (rows change while scaling
   below, and the crashloop pod's restart count climbs); follow logs of a `web` pod; exec terminal into a `web` pod (WebSocket) and run
   `ls`; scale Deployment `web` 2→3 and back. All through FleetConsole (KIND-5).
5. As that user, a `team-b` deep link shows the cluster's 403 as the normal forbidden state (no crash).
Finish with `scripts/kind-dev.sh down` (RAM, see MEMORY note) and `aspire stop`.

## Context pack
- README section added by T-0377; `docs/dev/TROUBLESHOOTING.md` cgroup entry.
- Logging in as a non-admin DevOAuth user: README "Logging in locally (DevOAuth)"; e2e helper `web/e2e/support/session.ts`.
- Exemplar of a recorded manual smoke: `docs/tasks/T-0102-deploy-dev-script.md` Work log (SMK-1) and mirror its Work log format.

## Acceptance criteria
- [ ] Checks 1-5 recorded with pass/fail; every failure filed as a bug task (`docs/tasks/`, next free T-number) and linked.
- [ ] kind cluster deleted and Aspire stopped at the end.

## Work log

## Review

## Handover notes
