---
id: T-0129
title: OCP parity — Timestamp cells, owner links, workload "N of M pods" link
status: done
owner: frontend-engineer
checkpoint: 3.6
depends_on: [T-0121]
paths: [web/src/shared/ui, web/src/features/resources/registry, web/src/features/resources/components]
review_rounds: 2
---

## Goal
Follow-ups from the T-0121 visual review: times, owners and workload status look and link like OCP on every list and
details page.

## Scope
- In: (1) every "Created"/time cell renders like OCP `Timestamp`: `RhUiClockIcon` + absolute date
  ("Nov 17, 2026, 9:54 PM"), relative ("5 minutes ago") only within 10.5 minutes, absolute in a tooltip is no longer
  the primary text (UX.md §5). (2) Pod Owner links to the owner (ReplicaSet needs a kind descriptor; list + details).
  (3) Deployment Status "N of M pods" links to the deployment's Pods tab (needs that tab; else coordinate with T-0122).
- Out: metrics columns.

## Context pack
- OCP: `/home/bad/works/openshift-console/frontend/packages/console-shared/src/components/datetime/Timestamp.tsx`
  (L22-34), `packages/console-shared/src/utils/datetime.ts:timestampFor` (L140-160); `public/components/utils/owner-references.tsx`,
  `public/components/pod-list.tsx` L388; `public/components/workload-table.tsx` L97-102.
- Ours: `web/src/features/resources/registry/columns.tsx:ageColumn` (`RelativeTime`), `kinds/pods.tsx` owner column,
  `components/ObjectReferenceLink.tsx`, `kinds/deployments.tsx:deploymentStatus`.

## Acceptance criteria
- [x] Side by side with OCP pods/configmaps lists: Created cells identical format, light + dark.
- [x] Pod Owner is a kind-badge link; deployment status links to its pods.
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-22 frontend-engineer: started together with T-0122 (shared Timestamp move, deployment Pods tab).
- 2026-11-22 frontend-engineer: done with T-0122. Shared `Timestamp` = OCP (clock icon, absolute, relative < 10.5 min,
  UTC tooltip) in lists, events, conditions; `OwnerReferences` links owners (ReplicaSet registered); deployment
  "N of M pods" links to the Pods tab. check-fe green. AC1: light compared; dark not screenshotted.
- 2026-11-22 frontend-engineer: fix round 1. `Timestamp` ticks (10 s) only while relative (`useTimestampNow` +
  `isRelativeTimestamp`), no timer once absolute; fake-timer test. `OwnerReferences` comment fixed. check-fe green.

## Review
### Code (frontend-architect)
CHANGES_REQUESTED (round 1). check-fe green, 778 tests.
- web/src/shared/ui/Timestamp.tsx:20 — every `Timestamp` starts its own 10 s `setInterval` and re-renders (with its
  `Tooltip`) forever, even when it shows an absolute date that can never change again. A 1000-pod list means 1000
  timers and about 100 renders/s for nothing — fix: tick only while the value is inside the relative window, e.g.
  `useNow(intervalMs: number | null)` skips the interval for `null`, and pass
  `recent ? 10_000 : null` where `recent` is computed from the current `now`. A value that ages out then stops its own
  timer. Add a test that an old timestamp registers no timer (`vi.useFakeTimers` + `vi.getTimerCount()`).
- Locale: accepted. The absolute text uses the browser locale (like OCP's `dateTimeFormatter`); relative text is
  pinned to `'en'` like the rest of the UI. Format/tooltip logic is pure and tested with fixed clocks.
- Owner links: accepted. Unknown or unregistered kinds degrade to badge + plain name (`ObjectReferenceLink.tsx:21`),
  and "No owner" is shown when there are none. `ReplicasCountLink` falls back to text outside a cluster.
- Nit (optional): `OwnerReferences` says "one per line" but renders inline siblings; wrap each in a block (or fix the doc).
- Round 2: APPROVE. `useTimestampNow` ticks only while `isRelativeTimestamp`; the effect clears itself once the text
  turns absolute. The "+1 timer over an old one" test is adequate. Verified that the other timer is PF `Popper`
  (`helpers/Popper/Popper.js:247`): on mount, with `isVisible` false, it calls `hide()`, which sets a one-shot
  exitDelay + animation `setTimeout`. That timer fires once and is cleared on unmount, so it is per row but neither
  periodic nor permanent. The `OwnerReferences` comment is now true ("inline one after another").

### Visual (ux-designer)
APPROVE (round 1). Configmaps/pods/deployments lists, pod + deployment details, 1280/1920, light/dark vs the reference console.
- Created cells: clock icon + "Oct 23, 2026, 1:17 PM", same as OCP `datetime/Timestamp.tsx` (configmaps list, Conditions,
  container Started); the absolute date is the primary text.
- Owner: RS badge + dashed link that wraps like OCP `pod-list.tsx` Owner; "No owner" is subtle (`owner-references.tsx:21`).
- Deployment "3 of 3 pods" is a link to the Pods tab, as in OCP `workload-table.tsx` L97-102.

## Handover notes
- `shared/ui/Timestamp` + `timestampText`/`utcTimestampText` replace `features/resources/components/Timestamp`;
  absolute text uses the browser locale (`Intl.DateTimeFormat(undefined, …)`) like OCP; ticks every 10 s only
  while relative.
- `ageColumn`, events Last seen, conditions and the pod containers' Started/Finished cells all use it.
- Owner: `OwnerReferences` in `components/ObjectReferenceLink.tsx` (all owners, "No owner"); pods list Owner column too.
- `ReplicasCountLink` (`registry/columns.tsx`) links to `<details>/pods`; the Pods tab comes from T-0122.
