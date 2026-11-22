---
id: T-0124
title: OCP parity — Events page and Events tab as OCP's event stream
status: done
owner: frontend-engineer
checkpoint: 3.6
depends_on: [T-0121]
paths: [web/src/features/resources/events, web/src/features/resources/list, web/src/features/resources/registry]
review_rounds: 2
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
- [x] Side-by-side `/c/dev-1/k8s/ns/shop/events` vs OCP `/k8s/all-namespaces/events` and the pod Events tab vs OCP
      pod events match at 1280 in light and dark.
- [x] Pause stops new cards; play resumes; filters narrow the stream.
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-22 frontend-engineer: started; read OCP `events.tsx`, `event-stream.tsx`, sysevent/toggle-play scss; OCP shots taken.
- 2026-11-22 frontend-engineer: `events/` stream (EventsPage, EventStreamView, EventCard, EventKindSelect, useEventStream,
  CSS module from `_sysevent-stream.scss`/`_toggle-play.scss`); descriptor `listLayout: 'eventStream'`; shared 10 s
  timestamp tick (one timer, OCP `useTimestampTick`). Side-by-side 1280 light/dark: events page, pod tab, empty tab match.
- 2026-11-22 frontend-engineer: fix round 1 — sort keys parsed once per event (WeakMap) + `latestEvents` cap test;
  `durationText` '-' for invalid dates (tests moved to `shared/ui`); text filter autofocus (targeted lint disable);
  `subscribeTimestampTick` no longer barrel-exported. `SinceFirst` 10 s tick kept (one shared timer, tiny span).

## Review

### Code (frontend-architect)
CHANGES_REQUESTED (round 1). `check-fe.sh` green (796 tests). Design, boundaries, memo, tick and pause are sound.
- `web/src/features/resources/events/eventStream.ts:64-71` — `sortEvents` calls `Date.parse` 2-4x inside the comparator
  over the *whole* watched list on every 100 ms flush (bench: 10k events 34 ms, 30k 95 ms vs 5/17 ms precomputed);
  a busy all-namespaces watch saturates the main thread — precompute keys once per event (e.g. a module `WeakMap<event,
  {last, first}>`: unchanged events keep identity across flushes), sort on numbers, then slice; keep the same order.
- `web/src/shared/ui/formatTimestamp.ts:59-63` — `durationText` of an unparseable date returns "NaN minutes" (OCP
  `timestampFor` returns "-" via `isValid`) — return `'-'` when `Number.isNaN(ago)`, add the case to its test.
- `eventStream.test.ts` / `EventsPage.test.tsx` — the 500 cap ("Showing most recent 500 events", oldest dropped, cap
  kept while paused) is untested — add one unit test of sort+cap (e.g. extract `latestEvents(list)` from the hook).
- Answers: (2) `timestampTick` is fine — Set-based, timer starts/stops with first/last subscriber, StrictMode's
  double effect just resubscribes, absolute timestamps unsubscribe; T-0129's "no timer when absolute" test still passes.
  (3) Pause deviation accepted: snapshot is a reference to one past array, cap applies to it via `all`; memory is the
  live cache, which is uncapped for *every* list (pre-existing; OCP's stream is watch-only, max 500) — file a follow-up
  (server `limit`/watch-only start for all-namespaces events). (4) `durationText` matches OCP `fromNow` omitSuffix;
  `index.ts` exports and the list/details test rewrites are in scope and correct.
- Nits (optional): `SinceFirst` ticks every 10 s although its text changes per minute (gate with `isLive` or accept);
  move the `durationText` tests next to `formatTimestamp` in `shared/ui`; `subscribeTimestampTick` need not be exported
  from `shared/ui/index.ts` (only the test uses it, via the module path).
- Round 2: APPROVE. Sort keys cached per event object (`WeakMap`) + `latestEvents` cap, `durationText` '-' on NaN, cap
  test, opt-in `autoFocus` matching OCP `events.tsx` L543, barrel trimmed; `check-fe.sh` green (798). Follow-up from
  round 1 (uncapped live events cache) still to be filed by the orchestrator.

### Visual (ux-designer)
APPROVE (round 1). Mock `/c/dev-1/k8s/{ns/shop,all-namespaces}/events`, pod tq5wn + deployment `web` Events tabs vs OCP
`/k8s/all-namespaces/events`, `/k8s/ns/openshift-console/deployments/console/events`; 1280 + 1920, light + dark.
- Cards match `events.tsx` `SysEvent` L197-285 + `_sysevent-icon.scss`: kind badge link, NS badge mid-row, clock + time,
  "N times in the last …", "Generated from kubelet on <host>", message; warning border/dot/connector; timeline + connectors (zoomed crop) match.
- Toolbar matches `EventsList` L500-570: Resources typeahead checkbox select with kind badges, "All types/Normal/Warning",
  "Filter Events by name or message..." with `/` hint, "Resource" LabelGroup chips (`categoryName`, "Show less").
- Status line matches L430-480: green-ring pause, "Streaming events..." / "Event stream is paused." / "Loading events...",
  "Showing N events" right, "Older events are not stored." end; "No events" and "No matching events / N events exist,
  but none match the current filter" match `NoEvents`/`NoMatchingEvents` L289-305 (tab shows "No events", like OCP).
- Deviations accepted: Pause keeping the watch (no visual difference); Resources = registry + seen kinds, no "Recently
  used" (needs discovery, not a parity blocker); node as plain text is OCP's own `!canListNode` branch (L240-246).
- Minor, follow-up (not blocking): OCP autofocuses the text filter (`events.tsx` L543/596 `autoFocus={!noProjectsAvailable}`);
  loading body is a PF Spinner vs OCP's `Loading` dots (`status-box`), consistent with our app-wide loading rule.

## Handover notes
- Events page (`ResourceListPage` → `events/EventsPage` when `descriptor.listLayout === 'eventStream'`) and Events tab
  (`events/ResourceEventsTab`) share `EventStreamView` + `useEventStream` (shared `useK8sList` watch, sort newest first,
  cap 500 = OCP `maxMessages`, client filters). Pause freezes a snapshot; the watch keeps running (OCP stops it), so
  play shows the latest at once.
- Perf: cards are `memo`'d by uid+resourceVersion (index ignored), rows use `content-visibility: auto` instead of OCP's
  react-virtualized; all timestamps share one 10 s interval (`shared/ui/timestampTick.ts`, Timestamp refactored onto it).
- Tab field selector = uid + name + kind, like OCP. List errors keep `ResourceErrorState`; a dropped watch shows OCP's
  "Error connecting to event stream" in the status line (replaces `LiveIndicator` for events).
- Deviations: Resources options = registry kinds + kinds seen in events (OCP: all discovered kinds, recently used);
  kubelet host is plain text (no Node page); filters are component state like OCP (not in the URL).
- Event descriptor has no columns/filters now; `registry.test` skips it for the default-sort check.
