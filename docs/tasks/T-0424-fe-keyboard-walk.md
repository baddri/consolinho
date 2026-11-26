---
id: T-0424
title: Keyboard-only walk e2e (switch cluster → project → failing pod → logs → kebab action) + focus-return fixes
status: todo
owner: frontend-engineer
checkpoint: 6b
depends_on: [T-0421, T-0422, T-0134]
paths: [web/e2e/keyboard.e2e.ts, web/src/shared/ui, web/src/features/resources/actions, web/src/features/cluster-context]
review_rounds: 0
---

## Goal
Prove the day-2 golden path works without a mouse, with visible focus, and that focus returns after modals close.
Spec CP6 **A11Y-5** (size **M**; if more than one shared component needs a focus fix, split the fixes out).

## Contract / design notes
- `keyboard.e2e.ts` (one test, `page.keyboard` only after login): Tab to the sidebar cluster switcher, open it, pick
  the fake prod cluster by arrow keys + Enter; open the project selector, pick `WORK_NAMESPACE`; Workloads → Pods via
  nav; filter by name, Enter on `CRASHING_POD`; Logs tab via arrow keys on the tab list; back to the Pods list, open
  the row kebab with Enter, choose an action (e.g. Edit labels), confirm the cluster-named modal with Enter; assert
  focus is back on the kebab toggle (`toBeFocused()`) and every focused element has a visible outline
  (`evaluate(getComputedStyle(document.activeElement).outlineStyle !== 'none')` is a read, allowed in e2e).
- Fixes for focus loss go in the shared component (e.g. the kebab `ActionMenu` toggle ref passed to PF
  `Modal`/`onClose`), never per page; use PF/React refs, no `document.querySelector` in app code.
- Record the walk as a numbered list in the spec-verify notes (this task's Work log, ≤ 5 lines).

## Context pack
- Exemplar: `web/e2e/layout.e2e.ts:L14-46` (L1: keyboard-operable switcher).
- Fixtures: `web/e2e/support/fakeWorkloadsApi.ts:CRASHING_POD`, `WORK_NAMESPACE`; cluster setup
  `web/e2e/support/registerCluster.ts:registerFakeCluster` (T-0422).
- Modal exemplar: `web/e2e/workloads.e2e.ts:expectProductionContext` (L137-141).
- OCP reference: `/home/bad/works/openshift-console/frontend/packages/console-app/src/components/nav/PerspectiveNav.tsx`
  (nav keyboard), `public/components/utils/kebab.tsx` (kebab focus).

## Acceptance criteria
- [ ] A11Y-5 walk passes in `scripts/check-e2e.sh keyboard.e2e.ts`, three runs in a row.
- [ ] Focus returns to the invoking control after the modal closes (e2e + RTL test on the fixed component).
- [ ] `scripts/check-fe.sh` green.

## Work log

## Review

## Handover notes
