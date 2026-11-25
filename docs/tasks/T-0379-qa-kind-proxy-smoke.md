---
id: T-0379
title: Proxy and connection-test smoke against kind through FleetConsole (KIND-5, CT-1/CT-2 on a real Kubernetes)
status: done
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
- [x] Checks 1-5 recorded with pass/fail; every failure filed as a bug task (`docs/tasks/`, next free T-number) and linked.
- [x] kind cluster deleted and Aspire stopped at the end.

## Work log
- 2026-11-26 qa-engineer: setup `kind-dev.sh up` + `tokens` (tokens in shell vars only), `aspire start`; registered
  `kind-dev` (Kubernetes, CA bundle) + both credentials via admin API; UI checks with a scratch Playwright script.
- Check 1 PASS: fleet-viewer test succeeded, `detectedDistribution: kubernetes`, headline clusterWideView; 11 checks, no
  "List cluster operators" (CT-1). Dialog: Distribution "No OpenShift APIs served", "Kubernetes version" only, no
  OpenShift version fact or step row (API step `openShiftVersion` is `skipped` and hidden) (CT-2).
- Check 2 PASS: team-a-editor (inspect `team-a`, prefilled from the saved value) succeeded, headline Limited; API
  `namespaceRules` team-a = 30 rules, complete; dialog shows the collapsed "Rules in namespace team-a" section.
- Check 3 PASS: grant team-a-editor readWrite to `alice`; her `GET /api/clusters` → `fallbackNamespaces: ["team-a"]` (NSA-1).
- Check 4 PASS (as alice, proxy API + UI): pods list 5 rows; watch stream (curl) got ADDED/MODIFIED/DELETED while scaling;
  UI pods list went 2→3→2 web rows without reload, scaled with the PodRing +/- on deployments/web; crashloop restarts
  7→8 live in UI after 103 s; log follow 200 chunked, kept open, new access-log line arrived live; UI logs tab shows
  nginx lines; exec WebSocket (`base64.channel.k8s.io`) ran `ls /` via the API and in the UI terminal. No page errors.
- Check 5 PASS: `/c/kind-dev/k8s/ns/team-b/pods` → "Restricted access: The service account for kind-dev can't list pods
  in team-b." (proxy 403, no crash). Extra: list namespaces → 403 as expected; token tail not found in Api log.
- Teardown: kind-dev cluster disabled + deleted in FleetConsole, `aspire stop`, `kind-dev.sh down` (status exit 1);
  `oc config current-context` unchanged. No defects, no bug tasks filed.

## Review

## Handover notes
All 5 checks pass on kind v1.37.0; KIND-5, CT-1, CT-2 (UI), NSA-1 verified manually. No bug tasks. The scratch
Playwright login/watch/terminal steps (login via "Log in with OpenShift", one browser context for two pages) are a usable
starting point for T-0386.
