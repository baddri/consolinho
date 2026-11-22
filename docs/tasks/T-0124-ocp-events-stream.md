---
id: T-0124
title: OCP parity — Events page and Events tab as OCP's event stream
status: todo
owner: frontend-engineer
checkpoint: 3.6
depends_on: [T-0121]
paths: [web/src/features/resources/events, web/src/features/resources/list, web/src/features/resources/registry]
review_rounds: 0
---

## Goal
OCP renders events as a live stream of cards, not a table. Our Events page and every Events tab show a table; replace
both with the stream so the screen is recognisable.

## OCP reference
- Routes: `/k8s/all-namespaces/events` (has data), `/k8s/ns/openshift-console/events`, `/k8s/ns/openshift-console/pods/<pod>/events`.
- Source: `public/components/events.tsx` (`EventsList` filters, `SysEvent` card L200-260, status line L440-460, "No events"
  L291), `public/components/utils/event-stream.tsx` (`EventStreamList`), `public/components/_sysevent-stream.scss`,
  `public/components/_sysevent-icon.scss`.

## Differences to fix
1. Events page — list toolbar + table with Type/Reason/Involved object/Message/Count/Last seen + kebab — OCP: heading
   "Events" (+ star), toolbar "Resources" (kind multi-select), "All types" (Normal/Warning), text filter "Filter
   Events by name or message" — then the stream. No kebab, no pagination.
2. Stream header — none — pause/play round button (green ring while streaming), "Streaming events...", right
   "Showing N events" / "Showing most recent N events" (`events.tsx` L440-460).
3. Event card — table row — OCP `SysEvent`: card with left timeline dot + line (`co-sysevent__icon-box`), header row:
   involved object `ResourceLink` (kind badge), namespace `NS` badge link, right: clock icon + time
   (relative/absolute) and "N times in the last <duration>"; second line "Generated from <component>[ on <host>]";
   body: message. Warning events get the warning style (`co-sysevent--warning`, `_sysevent-stream.scss`).
4. Events tab — same table — OCP tab is the stream without the toolbar, filtered to the object.
5. Empty — "No events" centred (`ConsoleEmptyState`).
6. Reuse the existing watch; no backend change. Keep the list virtualised or capped like OCP (most recent N).

## Context pack
- Docs: `UX.md` §6a.
- Touch points: `web/src/features/resources/events/ResourceEventsTab.tsx`, the Event kind descriptor in
  `features/resources/registry`, `list/ResourceListPage.tsx` (route the Event kind to the stream page),
  `list/LiveIndicator.tsx` (fold into the pause/play header).
- PF: `Card isCompact`, `Button variant="plain"` (pause/play), `Timestamp`/tooltip, `Select` checkbox.

## Acceptance criteria
- [ ] Side-by-side `/c/dev-1/k8s/ns/shop/events` vs OCP `/k8s/all-namespaces/events` and the pod Events tab vs OCP
      pod events match at 1280 in light and dark.
- [ ] Pause stops new cards; play resumes; filters narrow the stream.
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
