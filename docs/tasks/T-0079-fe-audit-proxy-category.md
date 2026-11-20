---
id: T-0079
title: Audit log — Proxy category, Kubernetes resource targets and outcome labels (+ T-0041 nits)
status: done
owner: frontend-engineer
checkpoint: 2
depends_on: [T-0060, T-0070, T-0055]
paths: [web/src/features/admin/audit/, web/src/shared/api/schema.gen.ts, web/src/shared/api/types.ts, web/src/mocks/fixtures/audit.ts, web/src/mocks/handlers/audit.ts, web/src/mocks/k8s/]
review_rounds: 0
---

## Goal
Auditors filter the audit log by the new `proxy` category and by cluster, and read each proxy entry as resource +
outcome (PAUD-4, US-10). The mock proxy records audit entries so the whole flow works in `dev:mock`.

## Scope
- Optional T-0070 mock nit: `web/src/mocks/k8s/apiServer.ts:~356` → `body?.spec?.resourceAttributes` (no 500 on SSAR without spec).
- In: regenerate `schema.gen.ts` once the BE audit enums land (`npm run gen:api`, or hand-sync from the contract if
  the Api can't run — then note it); `CATEGORIES` gains `proxy`; proxy rows show the target + an outcome label; mock
  fixtures (a few proxy entries incl. a denied one) and the mock proxy's `onProxyMutation` hook (T-0070) writing
  entries; carried T-0041 nits.
- Out: backend (T-0060 per `CP2-api-contract.md` header — orchestrator: confirm the BE task id that adds
  `AuditCategory.proxy`/`AuditTargetType.kubernetesResource` and replace it in `depends_on` if different).

## Contract / design notes
- BE contract `docs/specs/CP2-api-contract.md` §5 (assumed exactly): `category: 'proxy'`, `targetType:
  'kubernetesResource'`, `action: 'proxy.<verb>'`, `targetName` kubectl-style (`shop/configmaps/web`,
  `namespaces/shop`), `clusterName`, `details` JSON with `outcome: 'allowed' | 'denied'`, `reason: 'noAccess' |
  'userReadOnly' | 'readOnlyGrant' | 'bodyTooLarge' | null`, `statusCode: number`. `category=proxy&cluster=…` filters
  work server-side as for CP1 categories.
- `details` is `JsonElement` (untyped): parse with a small zod schema in `audit/proxyOutcome.ts`
  (`proxyOutcome(entry): { label: string; color: 'red' | 'green' | 'grey' } | undefined`): allowed → `<statusCode>`
  (green for 2xx, red otherwise, grey for 0 "client disconnected"); denied → "Denied — <reason text>" red, reason text
  "no access" / "read-only user" / "read-only grant" / "body too large". Unparseable → no label.
- `AuditEntryRow`: for `targetType === 'kubernetesResource'` render the `targetName` in monospace with the
  `proxyOutcome` label next to it (Target column); other categories unchanged. Category option label "Proxy".
- Mock: `onProxyMutation` (T-0070 hook point) records via `recordAudit` (`mocks/db.ts`) with the same shape — allowed
  mutations after the store change, denials (`Proxy.UserReadOnly`/`ReadOnlyGrant`/`NotAvailable` on mutations)
  before answering. GETs/watches/SSAR never audited.
- T-0041 nits: custom range "To" date defaults to 23:59 (not 00:00) of the chosen day; rename the
  typeahead-skeleton test to describe what it asserts.

## Context pack
- Docs: spec §4.4 PAUD-4; `CP2-api-contract.md` §5; ADR-0016 (generated types win, mocks typed by schema).
- Exemplars: `web/src/features/admin/audit/AuditEntryRow.tsx:L40-L75` (row cells), `web/src/features/admin/audit/auditFilters.ts:L8-L40`
  (`CATEGORIES`, `CATEGORY_OPTIONS`), `web/src/mocks/db.ts:recordAudit` (L99-L115).
- Touch points: `web/src/features/admin/audit/auditFilters.ts:CATEGORIES`, `AuditEntryRow.tsx` Target cell (L66-L68),
  `web/src/features/admin/audit/timeRange.ts` + `DateTimeField.tsx` (To default), `AuditLogPage.test.tsx:L231` (test
  name nit), `web/src/mocks/fixtures/audit.ts` (add proxy entries; keep `AUDIT_FIXTURE_COUNT` consistent),
  `web/src/mocks/k8s` `onProxyMutation`.

## Acceptance criteria
- [x] PAUD-4: Category filter offers Proxy; `category=proxy&cluster=dev-1` shows only proxy entries on dev-1; a PUT
      row shows `shop/configmaps/web` + "200"; a denied row shows "Denied — read-only grant".
- [x] In `dev:mock`, deleting a pod as admin on dev-1 then opening the audit log shows the `proxy.delete` entry.
- [x] T-0041 nits done; existing audit tests green.
- [x] No hand-written duplicate of generated types (QG-5). Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-20 frontend-engineer: in_progress → in_review. `gen:api` run against this worktree's Api (only the two enum
  additions changed). Proxy category + outcome labels (`proxyOutcome.ts`, zod), mock proxy audits mutations via shared
  `mocks/k8s/proxyAudit.ts` (also builds the 3 proxy fixture templates), T-0041 nits, SSAR-without-spec nit (400).

## Review
- 2026-11-20 frontend-architect: **APPROVE** (round 1). check-fe.sh green (52 files / 562 tests). Matches contract §5
  (actions, kubectl-style targetName, details shape, reason texts, 401-as-upstream); zod parse, no `any`; T-0041 nits
  done (To = 23:59 tested, test name now matches its assertions); audit points correct (path-400 and reads/watches/SSAR
  not audited, denials before answering, forwarded after the store change). No overlap with shared-tree `web/src/mocks`.
  Optional nits:
  - `AuditLogPage.test.tsx:225` — rows are pre-filtered to `proxy.` so the test can't catch non-proxy rows leaking; assert every data row's action starts with `proxy.`.
  - `proxyOutcome.ts:5` / `mocks/k8s/proxyAudit.ts:38` — reason texts duplicated (features can't import mocks; acceptable, keep in sync).

## Handover notes
- `proxyOutcome(entry)` parses `details` with zod; unknown reason → plain "Denied"; status 0 → grey "0 — client disconnected".
- Target cell: `kubernetesResource` rows render `<code>targetName</code>` + compact `Label`; other types unchanged.
- Mock: `mocks/k8s/proxyAudit.ts#proxyAuditInput(actor, mutation)` builds action/targetName/summary/details per
  contract §5 (pure). `handlers.ts` audits denials (noAccess on mutations, userReadOnly, readOnlyGrant, bodyTooLarge)
  before answering, forwarded mutations after the API server answered, expired credential as allowed 401.
  `ProxyMutation` moved there and gained `reason`; `proxyMutationListeners` kept as extra observers.
- Fixtures: 3 proxy templates appended (dev-1 PUT `shop/configmaps/web` 200, dev-1 denied delete, patch round-robin);
  `AUDIT_FIXTURE_COUNT` unchanged (132); index 0 entry unchanged.
- Outside `paths` (test-only): `mocks/audit.test.ts` category set gains `proxy`; `mocks/k8s.test.ts` new audit test.
- `DateTimeField` gained `defaultTime` (To uses 23:59).
