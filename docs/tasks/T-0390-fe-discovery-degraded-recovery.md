---
id: T-0390
title: Discovery — recover from a transient failure (last good result, 30 s retry, 5 min re-check, nav warning)
status: todo
owner: frontend-engineer
checkpoint: 6b
depends_on: []
paths: [web/src/shared/k8s/discovery.ts, web/src/shared/k8s/*.test.ts*, web/src/features/resources/nav, web/src/features/resources/index.ts, web/src/app/layout/AppSidebar.tsx, docs/architecture/FRONTEND.md]
review_rounds: 0
---

## Goal
Since T-0389 a discovery error lasts until reload: after a transient 503 (API server restart) the nav stays limited to
the baseline kinds. OCP polls discovery and keeps the last good result. Covers spec CP6 **DR-1..DR-5** (size **M**).

## Scope
- In: polling/recovery in `useK8sDiscovery`, `isDegraded` flag, one-line nav warning, FRONTEND.md "Data fetching rules" bullet.
- Out: backend discovery cache (CP6a DC), e2e (T-0426), toasts.

## Contract / design notes
- `useK8sDiscovery(cluster): { isServed(model): boolean; isPending: boolean; isDegraded: boolean }`.
  `isDegraded = query.isError` (TanStack keeps the last good `data` on a failed refetch → `served = data ?? BASELINE`,
  which is DR-1's "last good, else baseline" for free).
- Keep `staleTime: Infinity` and `retryOnMount: false` (T-0389 loop). Add
  `refetchInterval: (query) => intervalFor(query.state)` with an exported pure `discoveryRefetchInterval(state)`:
  error with `ApiError.status` 401/403 → `false` (DR-3; 401 already handled globally); other error → `30_000` (DR-1);
  success → `300_000` (DR-5, Q2). Leave `refetchIntervalInBackground` false (DR-4 hidden tab); inactive clusters have
  no observers, so they never poll (DR-4). An interval refetch keeps `status` (no pending → no skeleton flash, DR-2).
- `DiscoveryDegradedAlert({ cluster })` in `features/resources/nav/`, exported from `features/resources`:
  renders nothing unless `isDegraded`; else PF `Alert variant="warning" isInline isPlain` title
  "Some resource types could not be loaded. Retrying…" (UX notes §5). Rendered in `AppSidebar` between the switcher
  `div` and the cluster `NavList` (cluster perspective only). No toast.

## Context pack
- Docs: `FRONTEND.md` § Data fetching rules (add one bullet: discovery poll intervals + degraded flag).
- Exemplar: `web/src/features/fleet/api` fleet-status query (`refetchInterval` while visible, FRONTEND.md L161-165).
- Touch points: `web/src/shared/k8s/discovery.ts:useK8sDiscovery` (L33-46, whole file 46 lines);
  `web/src/app/layout/AppSidebar.tsx:L92-107` (Nav markup); `web/src/app/queryClient.ts:createQueryClient` (retry
  policy `retryTransientFailures`, 401 handler); `web/src/shared/api/errors.ts:ApiError.status`, `isApiError`.
  Callers that must keep compiling unchanged: `useClusterNav.ts:L93`, `ClusterLanding.tsx:L17` (+10 more, `grep -rn useK8sDiscovery\(`).
- Tests: existing discovery tests in `web/src/shared/k8s/hooks.test.tsx` / `useClusterNav` tests (grep `discovery`);
  use `vi.useFakeTimers({ shouldAdvanceTime: true })` + `server.use(...)` 503-then-200.
- OCP reference: `/home/bad/works/openshift-console/frontend/public/actions/k8s.ts:startAPIDiscovery` (L39-80, polls
  every `API_DISCOVERY_POLL_INTERVAL`) — OCP shows no warning; the alert is our spec'd addition.

## Acceptance criteria
- [ ] DR-1/DR-2: 503 then 200 → nav goes baseline + warning, then full nav and no warning after 30 s, no skeleton (test).
- [ ] DR-1: success, then 503 on re-check → last good kinds stay, warning shows (test).
- [ ] DR-3: 403 → one request, no further polling after 60 s of fake time (test); 404 polls ≤ 1 per 30 s.
- [ ] DR-5: `discoveryRefetchInterval` table test (success 5 min, error 30 s, 401/403 false).
- [ ] FRONTEND.md bullet; TSDoc updated. Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-26 frontend-architect: rewritten for CP6b (spec DR-1..5); was backlog follow-up of T-0389.

## Review

## Handover notes
