---
id: T-0428
title: CP6a SPA bits — "Client IP" in the audit expanded row, 429 mutation message names the cluster
status: todo
owner: frontend-engineer
checkpoint: 6a
depends_on: [T-0401, T-0403]
paths: [web/src/shared/api/schema.gen.ts, web/src/features/admin/audit/AuditEntryRow.tsx, web/src/features/admin/audit/AuditLogPage.test.tsx, web/src/mocks, web/src/features/resources/actions/useResourceMutation.ts]
review_rounds: 0
---

## Goal
The two SPA changes CP6a needs (spec **FWD-2** and UX notes §5 for **RL-2**) (size **S**). Depends on the backend
tasks providing `clientIp` on audit entries and 429 ProblemDetails on proxy mutations (ids from backend-architect).

## Contract / design notes
- `npm run gen:api` after the BE task; audit mock entries get `clientIp` (one `null`).
- `AuditEntryRow` expanded `DescriptionList`: add group "Client IP" → `entry.clientIp ?? '—'` (after the existing actor
  rows); not a list column.
- 429: if the BE detail already reads "Too many requests to <cluster>. Try again in N s.", `mutationErrorMessage` needs no
  change — add a test only. Otherwise, in `mutationErrorMessage(error, clusterDisplayName)` map `status === 429` to
  `Too many requests to ${cluster}. Try again in ${retryAfter} s.` (`Retry-After` must then be exposed on `ApiError`).
  Decide with the BE contract; prefer the server-provided detail (one source of truth).

## Context pack
- Touch points: `web/src/features/admin/audit/AuditEntryRow.tsx:AuditEntryRow` (L104-, `DescriptionList` L141);
  `web/src/features/resources/actions/useResourceMutation.ts:mutationErrorMessage` (L31-34); `web/src/shared/api/errors.ts:ApiError`.
- OCP reference: none for audit (Fleet invention, OCP `DescriptionList` style already used); action error alerts as in
  `/home/bad/works/openshift-console/frontend/public/components/modals/` (inline danger alert).

## Acceptance criteria
- [ ] Expanded audit row shows the IP or "—" (RTL test, both cases).
- [ ] A 429 on a modal action shows the cluster-named message (RTL test with MSW 429).
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
