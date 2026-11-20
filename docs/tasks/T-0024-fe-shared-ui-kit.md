---
id: T-0024
title: Shared UI kit — toasts, ErrorState, RelativeTime, ConfirmModal, EnvironmentLabel, ActionButton
status: done
owner: frontend-engineer
checkpoint: 1
depends_on: [T-0022]
paths: [web/src/shared/ui/, web/src/app/providers.tsx, web/src/features/cluster-context/]
review_rounds: 2
---

## Goal
The presentational building blocks every CP1 page uses, so pages stay declarative and consistent with the spec's
UX notes (§5) and ADR-0014/0015. **Parallel group F2** (with T-0023, T-0025).

## Scope
- In: components/hooks below, `ToastProvider` mounted in `AppProviders`, moving the environment label to `shared/ui`.
- Out: forms (T-0025), table kit (T-0026).

## Contract / design notes
All in `web/src/shared/ui/`, exported from its `index.ts`, each with a short TSDoc:
- `EnvironmentLabel({ environment: ClusterEnvironment; isCompact?: boolean })` + `environmentLabel(env)` → prod red /
  staging orange / dev green. **Moves** `ClusterEnvironmentLabel` + `environmentLabel` out of `cluster-context`
  (update `ClusterSwitcher`; `ClusterEnvironment` now comes from `@/shared/api` types).
- `ErrorState({ error: unknown; title?: string; onRetry?: () => void })` — inline `Alert variant="danger" isInline`
  with `errorMessage(error)` verbatim and a "Retry" `AlertActionLink` when `onRetry`.
- `ToastProvider` + `useToast(): { success(title, body?), info(...), warning(...), danger(...) }` — PF
  `AlertGroup isToast isLiveRegion`, auto-dismiss 8 s, close button; mounted in `app/providers.tsx`.
- `RelativeTime({ value: string | null; emptyText?: string })` — "5 minutes ago" via `Intl.RelativeTimeFormat`,
  absolute local date-time in a `Tooltip` (keyboard reachable like `SystemInfoFooter`'s `VersionLabel`), `<time
  dateTime>`; pure `formatRelativeTime(date, now)` unit-tested; future dates ("in 3 days") supported (expiry dates).
- `ConfirmModal` (ADR-0015 §7):
  `{ isOpen; title: string; titleLabel?: ReactNode; children: ReactNode; confirmLabel: string; variant?:
  'primary' | 'danger'; typeToConfirm?: string; isPending?: boolean; error?: unknown; onConfirm(): void; onClose():
  void }` — PF6 `Modal variant="small"` with `ModalHeader`/`ModalBody`/`ModalFooter`; with `typeToConfirm` the
  confirm button stays disabled until the exact text is typed; `error` renders `ErrorState` inside the body.
- `ActionButton` = PF `ButtonProps & { disabledReason?: string }` → `isAriaDisabled` + `Tooltip` when a reason is set
  (ADR-0014 §6). `disabledActionProps(reason?: string): { isAriaDisabled?: boolean; tooltipProps?: TooltipProps }`
  for `DropdownItem` and `ActionsColumn` items (PF6 supports both props on both).
- `LabelList({ labels: string[]; max?: number })` — PF `LabelGroup numLabels={max ?? 3}` with `collapsedText`
  `+${remaining}` (USR-1 groups).

## Acceptance criteria
- [x] RTL tests: toast appears and is announced (live region); ConfirmModal type-to-confirm gating and pending state;
      ActionButton with reason is focusable, not clickable (`onClick` not called) and shows the tooltip on focus;
      ErrorState shows a ProblemDetails `detail` and calls retry; RelativeTime past/future/null.
- [x] Switcher still renders env labels (existing AppShell tests green).
- [x] TSDoc on components. Build, lint and tests green (rule 4).

## Work log
- 2026-11-19 frontend-engineer: started; read CLAUDE.md, FRONTEND.md, ADR-0014/0015, contract §1-3, spec §5.
- 2026-11-19 frontend-engineer: implemented `shared/ui` kit (EnvironmentLabel moved from cluster-context, ErrorState,
  ToastProvider/useToast, RelativeTime + formatRelativeTime/useNow, ConfirmModal, ActionButton/disabledActionProps,
  LabelList), mounted ToastProvider in AppProviders, tests in `shared/ui/uiKit.test.tsx` + `formatRelativeTime.test.ts`.
  Set in_review.
- 2026-11-19 frontend-engineer: review round 1 fixes. Required 1: `ConfirmModal` sets `aria-labelledby` to the title
  id plus the label id when `titleLabel` is set, so the name is e.g. "Delete cluster prod-eu-1? prod"; there's a new
  test for the no-label (title-only) case. Clipping: the label now goes in `ModalHeader`'s `help` slot and the title
  is a plain string. Reasons: PF's `__header-main` has `min-width: 0`, so the title shrinks and gets PF's own ellipsis
  plus the automatic full-title tooltip in `ModalBoxTitle`, while `__header-help` has no CSS of its own and so, as a
  flex item, never shrinks below its content. No custom CSS or flex tricks are needed. Putting the label before the
  title would also stay visible, but the title would then sit in a nested flex item inside the nowrap h1 and be cut
  off hard, with no ellipsis or tooltip. Checked in headless Firefox with patternfly.css on the same header markup: a
  69-character title is ellipsised and the "prod" label stays fully visible at the top right, next to the close
  button; a short title puts the label in the same spot. Optional nits done: `ErrorState` takes `isLiveRegion`
  (turned on in ConfirmModal); while pending, the confirm button is `isAriaDisabled`, so focus stays on it (tested),
  and clicks are guarded by `canConfirm`; untyped confirm text still uses `isDisabled`. An empty `disabledReason` or
  `disabledActionProps('')` now counts as no reason. Not done: the "yesterday" wording and a shared `useNow` ticker
  (both left as the review allowed). Status in_review.

## Review
**2026-11-19 frontend-architect: CHANGES_REQUESTED (round 1).**
Checks: `npm run lint` clean, `typecheck` clean, `npm test -- --run` 18 files / 182 tests pass, `npm run build` OK
(only the existing >500 kB chunk warning, already a separate follow-up). Scope respected; feature boundaries fine
(`cluster-context` now imports `@/shared/ui` / `@/shared/api`, no stale `environmentLabel` imports); TSDoc on all
components and hooks; PF used idiomatically; no DOM access.

Required:
1. `web/src/shared/ui/ConfirmModal.tsx:66` and `:136-139` — the environment label is deliberately left out of the
   dialog's accessible name and description, so screen-reader users never hear "prod" when the dialog opens. The spec
   (§5) makes the label the safety signal for production confirmations, and the cluster name doesn't have to contain
   "prod". Sighted users see the red label straight away; assistive tech has to be told the same thing. **Fix:** give
   the label `FlexItem` an id and set `aria-labelledby={titleLabel === undefined ? titleId : \`${titleId} ${labelId}\`}`.
   Update `uiKit.test.tsx:132` so the expected name includes the label (`'Delete cluster prod-eu-1? prod'`), and add a
   case without `titleLabel` that keeps the title-only name. While you're there, check in a browser that a long title
   (for example a 50+ character cluster name) still shows the label. PF's `.pf-v6-c-modal-box__title-text` is
   `nowrap`/`overflow: hidden`, and your Flex sits inside it. If the label gets clipped, put it before the title text
   or in `ModalHeader`'s `help` slot. Record the result in the work log.

Rulings on the engineer's choices (all accepted unless noted):
- Toast close label `Close notification: <title>`: accepted. It's clearer than PF's default.
- Uncapped toasts: accepted for CP1. Each mutation gives one toast and they auto-dismiss after 8 s. If a later bulk
  flow toasts once per item, cap the stack then with `AlertGroup` `overflowMessage`/`onOverflowClick`.
- ConfirmModal: accessible name, see Required 1. Enter-to-confirm only when the text matches, through `canConfirm`:
  accepted, and pending blocks a second submit too. Cancel stays enabled while pending: accepted, since the header X
  can close the dialog anyway and the mutation keeps running. If a caller closes mid-flight, its `onError` should
  toast. Error display with `"<confirmLabel> failed"` and `null` ignored: accepted. Typed-text reset by mounting only
  while open: accepted (it's explicit, even though PF already unmounts closed modals).
- RelativeTime: truncation toward zero, accepted, because an expiry should never be overstated. Days up to 30, then
  30-day months, then 365-day years: accepted. The browser locale for the absolute tooltip next to English relative
  text is accepted, because date order is a locale matter. The "—" default is accepted. Pages pass "Never" where it
  means something. The 60 s `useNow` is accepted.
- ErrorState default "Something went wrong": accepted, as a fallback. Pages must pass a specific title.
- LabelList extras (`readonly string[]`, optional `aria-label`, `null` for an empty list): accepted. Callers should
  pass `aria-label`.
- Extra exports (`formatRelativeTime`, `formatAbsoluteTime`, `useNow`, `TOAST_TIMEOUT_MS`, `ShowToast`/`ToastApi`,
  `EnvironmentLabelStyle`, `DisabledActionProps`): accepted. Each has a real consumer (tests, filter chips, typed
  props).
- Spec confirmation rule: the kit supports it. The title TSDoc asks for object and cluster, `titleLabel` carries the
  `EnvironmentLabel`, and `variant="danger"` is available. Enforcement belongs to the page tasks' reviews. The red
  "prod" label works visually (it has text, so colour isn't the only signal). Only Required 1 is missing.

Optional nits:
- `ConfirmModal.tsx:162`: the dialog's `ErrorState` appears after an async failure but isn't announced. Consider an
  `isLiveRegion` pass-through on `ErrorState` and turning it on here.
- `ConfirmModal.tsx:172`: `isDisabled` while pending can drop focus from the confirm button when it becomes disabled.
  `isAriaDisabled` for the pending state would keep focus (`onClick` is already guarded by `canConfirm` only for
  Enter, so you'd need to guard the click too).
- `formatRelativeTime.ts:22`: with `numeric: 'auto'`, a time 40 h ago shows "yesterday", which may be two calendar
  days back. The tooltip covers it, so this is fine to leave.
- `useNow.ts:10`: one interval per `RelativeTime`. If the audit table renders hundreds of rows, a shared ticker
  (`useSyncExternalStore`) would be cheaper.
- `ActionButton.tsx:17`: `disabledReason=""` gives an aria-disabled button with an empty tooltip. Consider treating
  an empty string as no reason.

**2026-11-19 frontend-architect: APPROVE (round 2).**
Checks:
- `typecheck`: clean.
- `npm test -- --run`: 18 files, 184 tests passed.
- `build`: OK, with only the existing >500 kB chunk warning.
- `npm run lint`: fails, but only in T-0025's in-progress `src/shared/forms/` (12 `react-hooks/refs` errors, for
  example `TextField.tsx:51-52`). T-0024's own paths (`src/shared/ui`, `src/app`, `src/features/cluster-context`) lint
  clean. That failure belongs to T-0025's review, not here.

- Required 1 is resolved.
  - `ConfirmModal.tsx:66`: `aria-labelledby` is the title id plus the label id when there is a label, and the title id
    alone otherwise.
  - Tests check both names: `'Delete cluster prod-eu-1? prod'` with the label, the title alone without it, and the
    heading by itself.
- Label placement: I couldn't view the engineer's screenshots because the scratchpad had been cleared by the time I
  looked. I checked the PF 6 CSS instead.
  - `ModalHeader` with `help` adds `pf-m-help`, which lays the header out as a row.
  - `__header-main` has `flex-grow: 1; min-width: 0`, so a long title gets PF's own ellipsis and tooltip, because the
    title is now a plain string.
  - The help column keeps the label's natural width, so the label can't be clipped.
- **Trade-off ruling: accepted.** The label sits at the right edge of the header, not inline after the title.
  - It uses a documented PF slot instead of overriding PF's title truncation.
  - The label stays visible at any title length.
  - It's still in the header, next to the title, where people look before confirming.
  - The visual gap between the title and the label is a fair price for a label that can never be hidden.
- Optional items taken up:
  - The pending confirm button is `isAriaDisabled`, and clicks go through `confirm()`, which is guarded by
    `canConfirm`. Untyped text still uses a real `isDisabled`. That's fine: there's nothing to keep focus on before the
    text is typed.
  - The dialog error is a live region.
  - An empty `disabledReason` or `disabledActionProps('')` adds nothing.
  - All three are tested.
- Still open (optional, no action for this task): the `numeric: 'auto'` "yesterday" wording, and the per-instance
  `useNow` interval. Revisit the interval if the audit table gets large.

## Handover notes
**Done.** Everything is exported from `@/shared/ui` (`web/src/shared/ui/index.ts`).
- `EnvironmentLabel` / `environmentLabel` moved from `features/cluster-context` (old `ClusterEnvironmentLabel.tsx`
  deleted). `isCompact` defaults to `false`; the switcher passes `isCompact`. `cluster-context/index.ts` no longer
  exports `environmentLabel`/`ClusterEnvironment` (nobody imported them); use `@/shared/ui` and `@/shared/api`.
- `ErrorState` default title is "Something went wrong"; pages should pass a specific one ("Could not load users").
  Set `isLiveRegion` when the error appears after a user action rather than on page load.
- `ToastProvider` sits inside `ThemeProvider` in `AppProviders`, so `renderApp`/`renderWithProviders` get it for
  free. Bare `render()` tests of components that call `useToast` must wrap in `<ToastProvider>`. Close button label is
  `Close notification: <title>` (PF's default label repeats "alert:"). `TOAST_TIMEOUT_MS` (8000) is exported for
  fake-timer tests; PF pauses the timer while the toast is hovered/focused. No cap on the number of stacked toasts.
- `ConfirmModal`: content mounts only while open (typed text resets on reopen). The `titleLabel` goes in
  `ModalHeader`'s `help` slot (top right; never clipped by a long title, which gets an ellipsis and tooltip). The
  dialog's accessible name is title + label ("Delete cluster prod-eu-1? prod"), or the title alone without a label;
  the body is its description. With `typeToConfirm`, Enter in the input confirms. `isPending` makes confirm
  aria-disabled (focus kept) with a spinner; Cancel stays enabled. `error` renders
  `ErrorState title="<confirmLabel> failed" isLiveRegion` (announced); `null` (TanStack `mutation.error` default) renders nothing.
- `RelativeTime`: English relative text (`numeric: 'auto'`, so "now"/"yesterday"/"tomorrow"), values truncated
  toward zero (expiry never overstated), days up to 30 then months (30 d) then years (365 d). Absolute tooltip uses
  the browser locale. `null` → `emptyText` (default "—"); unparseable strings are shown raw. Re-renders every
  minute via `useNow` (exported).
- `ActionButton`/`disabledActionProps` follow ADR-0014 §6 (`isAriaDisabled` + tooltip); an empty reason counts as
  none. Verified with
  `DropdownItem`; `IAction` in `ActionsColumn` has the same two props.
- `LabelList` renders nothing for an empty list; takes optional `aria-label`.

**Gotchas.** Fake timers + user-event need `userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) })`
and `vi.useFakeTimers({ shouldAdvanceTime: true })` (see the toast and RelativeTime tests).

**Not done / follow-ups.** Build still warns about a >500 kB chunk. That warning was already there (no vendor
`manualChunks` in `vite.config.ts` yet, which FRONTEND.md requires). It belongs to a separate task.
