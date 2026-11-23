---
id: T-0183
title: Deployment "Edit update strategy" modal
status: done
owner: frontend-engineer
checkpoint: 4a
depends_on: [T-0182]
paths: [web/src/features/resources/workloads/deployments/ConfigureUpdateStrategyModal.tsx, web/src/features/resources/workloads/deployments/ConfigureUpdateStrategyModal.test.tsx, web/src/features/resources/workloads/deployments/useDeploymentActions.tsx]
review_rounds: 0
---

## Goal
DEP-8: OCP's "Edit update strategy" modal for Deployments.

## Contract / design notes
- OCP `configure-update-strategy-modal.tsx`: `Radio` "RollingUpdate" (help "The rolling update strategy …" — copy
  OCP's text) with "Max unavailable" / "Max surge" `TextInput`s (int or percent, zod `/^\d+%?$/`), and "Recreate"
  (help per OCP). Item after "Edit Pod count"; gating `patch deployments`.
- Patch: `replace /spec/strategy` with `{ type: 'Recreate' }` or `{ type: 'RollingUpdate', rollingUpdate: { maxUnavailable, maxSurge } }`
  (numbers stay numbers, `25%` stays string). react-hook-form + zod; on `ResourceMutationModal`.

## Context pack
- Exemplars: T-0182 `ConfigureCountModal` (same shell/mutation).
- OCP reference: `/home/bad/works/openshift-console/frontend/public/components/modals/configure-update-strategy-modal.tsx`.

## Acceptance criteria
- [x] DEP-8: modal prefilled from `spec.strategy`; switching to Recreate and saving sends one `replace /spec/strategy` without `rollingUpdate`; invalid values block Save with field error.
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-23 frontend-engineer: built `ConfigureUpdateStrategyModal` (RHF + zod on `ResourceMutationModal`, OCP copy,
  radios with body, "of pods" suffix + tooltip), "Edit update strategy" item after Restart rollout (patch deployments).
  5 tests in the modal test file + DEP-4 order updated. Gate: 85 files / 971 tests green, lint/typecheck/build ok.
  ui-probe not run (orchestrator: :5199 busy).
- 2026-11-23 fix round 1: intro as `Content component="p"` (was FormSection, +32px gap); `fieldA11y` via `@/shared/forms`.

## Review
- 2026-11-23 frontend-architect, round 1: **APPROVE**. Gate: lint/typecheck/build ok; 969/971 tests, the 2 failures
  are `AuditLogPage.test.tsx` load timeouts (unrelated), 14/14 green when rerun alone.
- Patch: one `replace /spec/strategy`; `toIntOrPercent` keeps `%` strings, numbers numeric, blank → `25%` (OCP
  `|| '25%'`); Recreate omits `rollingUpdate`. Simpler than OCP's remove+replace pair and safe when `rollingUpdate` is absent.
- zod: `superRefine` skips bounds for Recreate; `trigger` on radio change + `mode: 'onChange'` keep `isSaveDisabled` correct (tested).
- Order: after "Restart rollout" matches OCP `deployment-provider.ts` (Restart → health checks → storage → UpdateStrategy);
  the task's "after Edit Pod count" was imprecise. Gate `patch deployments` via shared `patchAccess` — correct.
- Deviations accepted: own error/toast copy (OCP has neither); local `BoundField` (shared `TextField` has no
  `InputGroupText` suffix); `useDeploymentActions.test.tsx` order constant is a required consequence of the new item.
- Nit (optional): `@/shared/forms/fieldA11y` deep import — re-export `fieldA11y`/`FieldHelperText` from the barrel in a follow-up.
- 2026-11-23 ux-designer round 1 UX: CHANGES_REQUESTED (mock UI dev-1/admin + prod-eu-1/alice, 1280 light; OCP `public/components/modals/configure-update-strategy-modal.tsx`, live :9000 down)
- Modal intro — 72px gap between the "Deployment web in shop on …" context line and "How should the pods be replaced…" (Edit Pod count: 40px): the intro `FormSection` is no longer the form's first child, so PF `.pf-v6-c-form__section:not(:first-child)` adds `--pf-v6-c-form__section--MarginBlockStart` (32px); in OCP it is the first child of `Form`, margin 0 — fix: render the intro as plain text (e.g. `Content component="p"`) so only the form gap (24px) separates them.
- OK: menu "Edit update strategy" right after Restart rollout (OCP `deployment-provider.ts`: Health checks/Add storage, not built, sit between); `ModalVariant.small` (560px), one close X, Save primary + Cancel link, checked radio focused (OCP `autoFocus`).
- OK: radios "RollingUpdate (default)" / "Recreate" with OCP descriptions; Max unavailable / Max surge, placeholder 25%, suffixes "of pods" / "greater than pods" (singular at 1 replica), tooltip "Current desired pod count", help text verbatim OCP.
- OK: "abc" shows field error "Enter a whole number of pods or a percentage, e.g. 25%." with Save `disabled`; switching to Recreate clears it; Save -> success toast "Update strategy saved for web on Development 1", details show Recreate.
- OK: alice on prod-eu-1 sees the item `aria-disabled` with tooltip "Your access to prod-eu-1 is read-only.".
- Note: Contract says "Item after Edit Pod count"; implemented order follows OCP, so the contract line is stale and no change is needed.
- 2026-11-23 ux-designer round 2 UX: APPROVE — intro is now `Content component="p"`; context line to intro gap measured 40px (Edit Pod count: 40px), no 32px FormSection margin left. No regressions in scope.

## Handover notes
- Patch is one `replace /spec/strategy`; `toDeploymentStrategy` (exported, unit-tested) maps form → API: `25%` stays a
  string, `1` becomes a number, blank bound saves 25% (OCP fallback), Recreate omits `rollingUpdate`.
- Validation (`/^\d+%?$/`, blank allowed) runs only for RollingUpdate; `mode: 'onChange'` + `trigger` on radio change so
  switching to Recreate clears errors. Save disabled via `isSaveDisabled` while errors exist (OCP does not validate).
- Bounds use a local `BoundField` (not shared `TextField`) because OCP's input carries an `InputGroupText` suffix;
  imports `fieldA11y`/`FieldHelperText` from the `@/shared/forms` barrel (now exported).
- OCP puts the intro "How should the pods be replaced…" in the body (`FormSection`), as plain `Content` text, not the header description.
- Success toast copy is ours: "Update strategy saved for <name> on <cluster>". ui-probe still to run on the modal.
