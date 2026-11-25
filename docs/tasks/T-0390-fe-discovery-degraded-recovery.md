---
id: T-0390
title: Discovery — recover from a transient failure (degraded flag + 30 s poll, like OCP)
status: todo
owner: frontend-engineer
checkpoint: backlog
depends_on: [T-0389]
paths: [web/src/shared/k8s/discovery.ts, web/src/features/resources/nav]
review_rounds: 0
---

## Goal
Since T-0389, a discovery error lasts until the page is reloaded: after a transient 503, for example during an API
server restart, the nav stays limited to the core kinds. OCP instead polls discovery every 30 s and keeps the last good
result (`/home/bad/works/openshift-console/frontend/public/actions/api-discovery.ts:startAPIDiscovery`).

## Contract / design notes
- On error, discovery returns the core kinds with a `degraded` flag and polls every 30 s while degraded.
- The page must not flash a loading state while it polls. Do not refetch the failed query (that brings back the T-0389 loop).

## Acceptance criteria
- [ ] A 503 followed by a 200 recovers the full nav without a reload, and the skeleton does not reappear (test).
- [ ] A permanent 404 sends no more than one request per 30 s (test).
- [ ] Build, lint and tests green (CLAUDE.md rule 4)
