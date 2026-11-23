---
id: T-0184
title: Pod ring scale up/down buttons (debounced)
status: done
owner: frontend-engineer
checkpoint: 4a
depends_on: [T-0182]
paths: [web/src/features/resources/components/PodRing.tsx, web/src/features/resources/components/PodRing.module.css, web/src/features/resources/components/PodRing.test.tsx, web/src/features/resources/registry/kinds/deployments.tsx]
review_rounds: 0
---

## Goal
DEP-5: OCP's ring arrows on the Deployment details page — click up/down changes the shown target instantly, and a
single scale PATCH is sent 1 s after the last click (ADR-0037 §7, `use-debounce`, flushed on unmount).

## Contract / design notes
- `PodRing` gains optional `scale?: { desired: number; onScale(n: number): void; disabled?: DisabledActionProps }`;
  without it the ring stays read-only (other kinds). Buttons: PF `Button variant="plain"` with `AngleUpIcon` /
  `AngleDownIcon`, aria-labels "Increase the pod count" / "Decrease the pod count" (OCP), down disabled at 0;
  ring title shows the pending count ("scaling to n" — OCP copy) until the watch catches up.
- `deployments.tsx` `DeploymentPodRing` passes `useScaleDeployment` + `useActionAccess(patch deployments/scale)`.
- `useDebouncedCallback(fn, 1000)` and `.flush()` in the unmount cleanup.

## Context pack
- Exemplars: `details/PodRing.tsx` L83 (props {cluster, workload, selector}); `registry/kinds/deployments.tsx` L60, L135.
- OCP reference: `/home/bad/works/openshift-console/frontend/packages/console-shared/src/components/pod/PodRing.tsx`
  L36 clickCount, L55 debounce, L134-162 buttons.

## Acceptance criteria
- [x] DEP-5: three quick up-clicks send one PATCH with replicas +3 after ~1 s (fake timers); down disabled at 0.
- [x] RO/RBAC: arrows aria-disabled with the reason; no PATCH.
- [x] Unmount during the debounce window still sends the PATCH.
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-23 frontend-engineer: started; PodRing lives in `components/` (not `details/` as `paths` says).
- 2026-11-23 frontend-engineer: arrows + debounced pending count in `components/PodRing.tsx`, `DeploymentPodRing` wires
  `useScaleDeployment` + `useActionAccess(patch deployments/scale)`; 6 tests in `components/PodRing.test.tsx`. Gate green.

- 2026-11-23 frontend-engineer: fix round 1: failed scale resets to `desired` (`mutateAsync`, 403 test), caret 20px rule removed, `flushOnExit`, paths fixed.

## Review
- 2026-11-23 frontend-architect, round 1: **CHANGES_REQUESTED**. Gate green (BulkGrantWizard 5 s timeout under load;
  passes alone). Debounce OK: `send` is stable (use-debounce memo has no `func` dep), flush on unmount calls only
  `onScale` (no setState after unmount), clamp at 0 + down disabled OK, access via cached `useCanI` query, not per render.
  - `components/PodRing.tsx:82,92` + `registry/kinds/deployments.tsx:94-95` — a failed scale PATCH never rolls back:
    `desired` does not change, so the ring keeps saying "Scaling to n" forever and the next click starts from n —
    let `onScale` return a promise (`scale.mutateAsync(...)`) and in `usePendingScale` reset `count` to the latest
    `desired` when it rejects (swallow the rejection; the toast already reports it); add a test (MSW 403 on `…/scale` →
    toast + ring back to the original count).
  - Nit (optional): `PodRing.tsx:99-104` — use-debounce 10.1 has `{ flushOnExit: true }`; prefer it over the
    hand-rolled flush effect (also flushes when the tab is hidden).
  - Nit (optional): frontmatter `paths` still say `details/`; correct them to `components/`.
- 2026-11-23 ux-designer, round 1: CHANGES_REQUESTED (mock :5247, 1280, light; OCP ref :9000 down, so measured ours vs
  OCP source `console-shared/src/components/pod/PodRing.tsx` L124-162 and `PodRing.scss`).
- U1 — arrows: icons render at 20px and the buttons at 46x46 because of `.arrow { font-size: 20px }`. OCP passes
  `style={{ fontSize: '20' }}`, a unitless *string* that React writes as-is and the browser drops, so OCP's carets render
  at the plain button's default size (body 14px, about a 37px button). Fix: delete the `.arrow` rule and className, which
  also removes the custom CSS. Re-measure on the ref console when it is up.
- OK: placement (Split → Bullseye → stacked `isBlock` plain buttons to the right of the 130px ring). "Scaling to n" shows
  at once, and 3 clicks sent one PATCH about 1.4 s later (value 6). alice on prod-eu-1: both arrows aria-disabled, tooltip
  "Your access to prod-eu-1 is read-only.", no PATCH. Tab moves up → down and Enter scales. Only Deployments render a ring.
- 2026-11-23 ux-designer, round 2: APPROVE. U1 fixed: the carets are 14px and the buttons 37x37 (button font 14px), as in
  OCP. Failed scale (PATCH stubbed to 403): the ring goes from "Scaling to 4" back to "Pods" and shows the toast
  "Scale failed" with the API message. No regressions.
- 2026-11-23 frontend-architect, round 2: **APPROVE**. All round-1 fixes verified: `onScale` returns `mutateAsync`,
  rejection clears `pending` (ring shows `desired`), MSW 403 test; `flushOnExit: true`; `.arrow` removed; `paths` fixed.
  Gate: lint/typecheck/build ok; AuditLogPage + BulkGrantWizard 5 s timeouts under load pass alone (with PodRing, 27/27).
  - Nit (optional): `components/PodRing.tsx:82` — stale orphan TSDoc ("Sends the scale request…") above the new one; merge.
  - Nit (optional): `PodRing.module.css` — only a trailing blank line remains in the diff; drop it.

## Handover notes
- Files: `web/src/features/resources/components/PodRing.{tsx,module.css,test.tsx}` (task `paths` said `details/`;
  the ring has always lived in `components/`), `registry/kinds/deployments.tsx` (additive `DeploymentPodRing`).
- `PodRing` `scale?: PodRingScale { desired, onScale, disabled? }`; ReplicaSets etc. stay read-only.
- `usePendingScale`: OCP `prevReplicas` reset when the watch reports a new `spec.replicas`; `useDebouncedCallback`
  (trailing, 1 s) with `flushOnExit`; a rejected `onScale` resets to `desired`. OCP uses lodash `leading: true, trailing: false` (first click PATCHes at
  once, later clicks in the window are dropped); we follow ADR-0037 §7 (one PATCH after the last click).
- Deviations from the task text, to mirror OCP: `RhUiCaretUp/DownIcon` at PF default size (OCP's unitless 20 is ignored), not `AngleUp/Down`; copy
  "Increase/Decrease the Pod count" (OCP capital P); `title` tooltip as OCP. Pending count shows via OCP's
  existing label ("Scaling to n", capital S). OCP hides the arrows without access; we aria-disable with the reason (AC).
- Scale failures toast "Scale failed" (`toastErrors`). Not mirrored: HPA / non-scalable-image / Enable Autoscale.
- UI probe not run: it is hard-wired to port 5199 (orchestrator said not to use it) and the OCP ref on :9000 was down.
