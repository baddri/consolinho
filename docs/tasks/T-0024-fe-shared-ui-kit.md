---
id: T-0024
title: Shared UI kit — toasts, ErrorState, RelativeTime, ConfirmModal, EnvironmentLabel, ActionButton
status: todo
owner: frontend-engineer
checkpoint: 1
depends_on: [T-0022]
paths: [web/src/shared/ui/, web/src/app/providers.tsx, web/src/features/cluster-context/]
review_rounds: 0
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
- [ ] RTL tests: toast appears and is announced (live region); ConfirmModal type-to-confirm gating and pending state;
      ActionButton with reason is focusable, not clickable (`onClick` not called) and shows the tooltip on focus;
      ErrorState shows a ProblemDetails `detail` and calls retry; RelativeTime past/future/null.
- [ ] Switcher still renders env labels (existing AppShell tests green).
- [ ] TSDoc on components. Build, lint and tests green (rule 4).

## Work log

## Review

## Handover notes
