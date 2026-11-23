---
id: T-0170
title: Mock cluster prod-k8s-1 (Kubernetes, production, alice read-only)
status: todo
owner: frontend-engineer
checkpoint: 4a
depends_on: []
paths: [web/src/mocks/fixtures/clusters.ts, web/src/mocks/fixtures/grants.ts, web/src/mocks/fixtures/credentials.ts, web/src/mocks/k8s/fixtures.ts, web/src/mocks/clusters.test.ts, "tests asserting mock cluster counts/names (grep)"]
review_rounds: 0
---

## Goal
FND-1 (FE half): the mock backend has a production **Kubernetes** cluster `prod-k8s-1` so the K8s tag + production
label + navy masthead + production band (and the RO paths of CP4a) are reachable in `npm run dev:mock`. The AppHost dev
seed half is a backend task (BE "dev seed prod-k8s-1").

## Scope
- In: cluster fixture (distribution `kubernetes`, environment `production`, a long display name, e.g.
  "Production Kubernetes Frankfurt 1" — FND-2 needs one), a credential for it, grants alice **readOnly** + admin
  readWrite; k8s store seed (namespace `default`/`shop` with a Deployment + Pods, reuse the lab-1 seed shape); fixture
  TSDoc; test counts/names that change.
- Out: AppHost seed (BE), switcher layout (T-0171), band review (T-0172).

## Contract / design notes
- MSW only; no BE dependency. Keep `itemId`/name `prod-k8s-1` exactly (e2e QGA-2c uses it).
- Put it after `prod-us-1` in fixture order so the production group stays together in the switcher.

## Context pack
- Exemplars: `web/src/mocks/fixtures/clusters.ts` `lab-1` entry (L110-125, Kubernetes) and `prod-eu-1` (L20-36, production);
  `web/src/mocks/fixtures/grants.ts` TSDoc L44-48 + alice grants; T-0147 work log "lab-1 credential + grants" (same change shape).
- Touch points: `mocks/clusters.test.ts` (row names), `mocks/db.ts:clearClusterAccess`; find count assertions with
  `grep -rln "lab-1\|toHaveLength(6)\|6 clusters" web/src --include=*.test.tsx`.

## Acceptance criteria
- [ ] FND-1: `/c/prod-k8s-1/...?mockUser=alice` shows `K8s` tag, production label, navy (Kubernetes) masthead, production band; switcher item shows "Read only".
- [ ] admin sees it read-write; the k8s store serves at least one Deployment with 2 Pods in a namespace.
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
