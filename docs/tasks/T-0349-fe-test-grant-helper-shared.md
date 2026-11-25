---
id: T-0349
title: Move the duplicated `grantAdminOn` MSW test helper into web/src/test
status: todo
owner: frontend-engineer
checkpoint: 5b
depends_on: [T-0332]
paths: [web/src/test, web/src/features/resources/compute/nodes/nodes.test.tsx, web/src/features/resources/nav/distributionDiscovery.test.tsx]
review_rounds: 0
---

## Goal
`grantAdminOn(clusterName)` (gives `admin` a credential + grant on an ungranted mock cluster) now exists twice
(`distributionDiscovery.test.tsx`, `compute/nodes/nodes.test.tsx`) with small drifts. One shared helper avoids a third copy.

## Scope
- In: export `grantAdminOn` from `web/src/test/` (next to `handlers.ts` / `mockDb`), replace both copies.
- Out: changing which clusters the default fixtures grant.

## Context pack
- Exemplars: `compute/nodes/nodes.test.tsx:grantAdminOn` (L12-29), `nav/distributionDiscovery.test.tsx:grantAdminOn`.
- Touch points: `web/src/test/handlers.ts:mockDb`.

## Acceptance criteria
- [ ] One helper with TSDoc; both tests import it; no behaviour change.
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
