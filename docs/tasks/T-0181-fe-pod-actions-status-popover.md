---
id: T-0181
title: Pod kebab actions and the OCP pod status popover
status: done
owner: frontend-engineer
checkpoint: 4a
depends_on: [T-0175, T-0177]
paths: [web/src/features/resources/registry/kinds/pods.tsx, web/src/features/resources/registry/kinds/pods.test.tsx, web/src/features/resources/workloads/pods]
review_rounds: 0
---

## Goal
DEP-1, DEP-2 (Q6 accepted: OCP status popover): Pod row/details kebab = Edit labels, Edit annotations, Edit Pod,
Delete Pod (common set, no kind items, as OCP); the Status column shows OCP's popover for problem states with
"View logs" / "View events" links.

## Scope
- In: `workloads/pods/PodStatus.tsx` + `PodStatusPopover.tsx` + test; pods descriptor uses it for the Status column
  and the details summary status.
- Out: debug-container link (OCP has it; out of CP4a scope per spec).

## Contract / design notes
- `PodStatus({ pod, cluster })`: computed by the existing `podStatus()` (pods.tsx L18). For `CrashLoopBackOff`,
  `ErrImagePull`, `ImagePullBackOff`, `Error`, `Failed`, `OOMKilled` etc. (OCP `pod-list.tsx` L236-340 list) render a PF
  `Popover` trigger (`Button variant="link" isInline` with the status icon + text, as OCP `PodStatusPopover` L223);
  body = container `state.waiting.message` / `terminated.reason` text + `Link`s "View logs" →
  `resourcePath(..., { tab: 'logs', search: { container } })` and "View events" → events tab. Other states keep
  `ResourceStatusLabel`.
- Kebab: verify after T-0176/T-0177 the generic set already matches OCP pod-provider; only a test here.

## Context pack
- Exemplars: `registry/kinds/pods.tsx:podStatus` L18 and the Status column; `shared/ui` `ResourceStatusLabel`.
- OCP reference: `/home/bad/works/openshift-console/frontend/public/components/pod-list.tsx` L223 `PodStatusPopover`,
  L236-340 `PodStatus`; `packages/console-app/src/actions/providers` pod provider (grep `usePodActions`).

## Acceptance criteria
- [x] DEP-1: pod kebab lists Edit labels, Edit annotations, Edit Pod, Delete Pod in that order (test).
- [x] DEP-2: CrashLoopBackOff row shows a popover with the reason and working "View logs" (opens Logs with that container) / "View events" links (test).
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-23 frontend-engineer: `workloads/pods/{PodStatus,PodStatusPopover,podStatus}` mirroring OCP `PodStatus`
  (unschedulable, CreateContainer*, CrashLoopBackOff, ErrImagePull/ImagePullBackOff); pods Status column + Details
  Status row use it. Kebab already matched OCP pod-provider; DEP-1/DEP-2 tests in `kinds/pods.test.tsx`. Gate green.
- 2026-11-23 fix round 1: cold-start timeouts + `preloadLazyRoutes` in `pods.test.tsx`; `&emsp;` between popover links.

## Review
- 2026-11-23 frontend-architect, round 1: **CHANGES_REQUESTED**. The code matches OCP `pod-list.tsx` L223-340: the
  states, copy, `PodStatusPopover` trigger and `Content` footer all line up. All three deviations are accepted. The
  `?container=` value comes from the shared `CONTAINER_PARAM` (`workloads/useSelectedContainer.ts`, the same on
  cp/4-workloads). There are no per-row fetches. TSDoc is OK and the ACs are covered.
  - `web/src/features/resources/registry/kinds/pods.test.tsx:42`: this full-app test is the first `renderApp` in the file. Under the full gate,
    `findByRole('row')` failed: "Unable to find role=row" (it passes alone). Required fix: pass
    `{ timeout: COLD_START_TIMEOUT_MS }` to that wait and give the test `COLD_START_TEST_TIMEOUT_MS`
    (`test/coldStart.ts`). If the Logs tab is lazy, also call `preloadLazyRoutes` in `beforeAll`.
  - Nit (optional): `PodStatus.tsx:84` puts `' '` between the links, but OCP uses `&emsp;`. Use `{' '}` for the same gap.
- 2026-11-23 frontend-architect, round 2: **APPROVE**. `pods.test.tsx` now has `preloadLazyRoutes` in `beforeAll` and
  the cold-start wait/test timeouts on DEP-2. `PodStatus.tsx:86` separates the links with `&emsp;`, as OCP does. Gate:
  lint, typecheck and build are ok. The 2 timeouts in untouched files (`AuditLogPage`, `EditMetadataModals`) pass when rerun alone.
- 2026-11-23 ux-designer (round 1): **APPROVE**. Checked on the mock at :5245, 1280 wide, with the CrashLoopBackOff pod
  `shop/web-7d4b9c8f6d-tq5wn`. The OCP reference console was down, so this was judged against `public/components/pod-list.tsx` L223-340 and `pod.tsx` L311-316.
- U-ok: the trigger is PF `Button link isInline` > `Status` (danger icon + text, PF dashed underline). It is the same tree as OCP, with no custom CSS.
- U-ok: the popover has the header "Pod crash loop backoff", the waiting message as body, and footer copy that matches OCP word for word. Width is 332px (PF default) and placement is top with auto-flip. The same holds in the list Status column and the Details Status row.
- U-ok: "View logs" goes to `/logs?container=web` and "View events" to `/events`. The row kebab and the details Actions dropdown both list Edit labels, Edit annotations, Edit Pod, Delete Pod, the same order as OCP pod-provider.
- U1 (nit, non-blocking): the links are separated by `{' '}`, while OCP uses `&emsp;` (pod-list.tsx CrashLoopBackOff footer). The measured gap is already 14px, so nothing changes visibly. Align it the next time this file is touched.

## Handover notes
- Popover states follow OCP `pod-list.tsx` exactly, not the task's "Error, Failed, OOMKilled" (OCP shows plain status
  for those). ErrImagePull/ImagePullBackOff: message only, no header/links (as OCP). Debug-container links omitted.
- `PodStatus({ pod })` reads the cluster via `useActiveCluster()` (column cells get no cluster); plain status outside
  `/c/:cluster`. "View logs" adds `?container=<first waiting container>`.
- `podStatus()` moved to `workloads/pods/podStatus.ts` (avoids an import cycle with `PodStatus`); `kinds/pods.tsx`
  re-exports it. `PodDetails` `status` prop is now a `ReactNode` (small change outside `paths`).
- UI probe not run: it needs port 5199, which the orchestrator reserved. Trigger = PF `Button variant="link" isInline`
  wrapping `Status`, same as OCP.
