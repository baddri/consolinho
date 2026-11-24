---
id: T-0205
title: Audit log blank scroll after the end; Edit labels input without an inner focus ring
status: done
owner: frontend-engineer
checkpoint: 4c
depends_on: []
paths: [web/src/features/admin/audit/AuditLogPage.tsx, web/src/features/admin/audit/AuditLogPage.test.tsx, web/src/features/resources/actions/EditLabelsModal.tsx, web/src/features/resources/actions/EditLabelsModal.module.css]
review_rounds: 1
---

## Goal
Human report 2026-11-24 #5 and #6. (5) Fleet administration › Audit log: after "Showing 47 entries / End of audit
log" the page scrolls on through a long empty area. (6) Edit labels modal: the text input inside the labels box shows
its own focus ring nested in the outer box; OCP's tags input has none.

## Scope
- In: the footer under the audit table; the label input styling in `EditLabelsModal`.
- Out: audit filters/table, Edit annotations modal (different component), shell scrolling (T-0204).

## Contract / design notes
**(5) Root cause (probe, `/fleet/admin/audit?mockUser=admin`, 1280):** `main.scrollHeight` 4831 vs content end ~2490.
The footer is a PF `Stack` (`AuditLogPage.tsx` ~L151, `<Stack hasGutter className="pf-v6-u-mt-md">`) placed *after*
the table; PF's `.pf-v6-l-stack` has `height: 100%`, so it is as tall as the whole page body (2380px) and adds that
much blank space below the table. Fix: a layout without a height, e.g. `Flex direction={{default:'column'}}
spaceItems={{default:'spaceItemsMd'}}` (same 16px gap as `hasGutter`), or drop the wrapper; keep `pf-v6-u-mt-md`.
Expected: `main.scrollHeight` ≈ bottom of the "End of audit log" row + page-section bottom padding (24px at 1280).
Grep for other `Stack` used as a non-filling sibling below content in `features/admin` and note any hits in the Work
log (fix only this one).

**(6) OCP `SelectorInput`** (`public/components/utils/selector-input.tsx:191-236`, used by
`public/components/modals/labels-modal.tsx:148`): outer `div.pf-v6-c-form-control` (the only border: 1px
`--pf-t--global--border--width--control--default`, `--border--color--control--default`, radius
`--pf-t--global--border--radius--control--form-element`; hover `::after` `--border--width--control--hover` +
`--border--color--hover`) › `.co-tags-input` (padding `--pf-t--global--spacer--sm`) › `.tags` (flex wrap,
`gap: --pf-t--global--spacer--xs`, `min-height: 120px`, `align-content: flex-start`) › labels + a bare `<input>`
styled by `public/components/utils/_label.scss:47-52`: `background: transparent; border: 1px solid transparent;
flex-grow: 1; outline: none` (browser default padding, no PF control padding). Invalid entry: input text
`--pf-t--global--text--color--status--danger--default` (`_label.scss:54-56`).
- Ours (`EditLabelsModal.tsx` L136-167): `TextInputGroup` › `TextInputGroupMain`; the inner
  `input.pf-v6-c-text-input-group__text-input` gets PF's `outline-offset: -6px` focus outline (probe: `outline auto
  1px`, 381x37 box) and control padding 8px 16px, so a second box appears inside the first.
- Fix in `EditLabelsModal.module.css` (scoped to `.tagsInput`, each rule commented with the OCP selector):
  inner text input `outline: none`; padding `1px 2px` (OCP's browser-default input padding) via the PF variables
  `--pf-v6-c-text-input-group__text-input--Padding{BlockStart,BlockEnd,InlineStart,InlineEnd}`; keep the outer box,
  its 8px padding, 120px min height and xs gaps. Keep `validated="error"` on the group (our red border is the
  existing a11y cue) and, as OCP, colour the input text danger while invalid.
- Accessibility: with the inner outline gone, give the outer group a focus cue in OCP's own style: on
  `:focus-within` use the same border as PF hover (`--pf-v6-c-text-input-group--BorderColor:
  var(--pf-t--global--border--color--hover)`), so keyboard users still see where focus is. Note this one deviation
  (OCP shows none) in the rule's comment.

## Context pack
- Touch points: `web/src/features/admin/audit/AuditLogPage.tsx` footer `Stack` (~L151-180);
  `web/src/features/resources/actions/EditLabelsModal.tsx` (L136-167), `EditLabelsModal.module.css` (`.tagsInput`).
- OCP reference: `public/components/utils/selector-input.tsx:191-236`, `public/components/utils/_label.scss:30-56`,
  `public/components/modals/labels-modal.tsx:148`. Audit log is a fleet page (no OCP counterpart for the footer).
- Probe: labels modal via pod `db-0` on `staging-eu-1` (`?mockUser=alice`) › Actions › Edit labels; focus the input
  with Tab; read the focused input's `outline-style` and the group's `::before` border.

## Acceptance criteria
- [x] Audit log: scrolling stops at the end of the footer (probe `main.scrollHeight` vs footer bottom), with and
      without "Load more", light and dark.
- [x] Edit labels: focused input has `outline-style: none`, no inner box; only the outer box border, which shows
      the hover-colour border while focused; typing/Enter/Backspace/blur behaviour unchanged.
- [x] Invalid entry: red input text + existing error helper text and red group border.
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-24 frontend-engineer: audit footer `Stack` → column `Flex` (spaceItemsMd, mt-md); test asserts no
  `.pf-v6-l-stack` ancestor. Probe 1280 light/dark: last page section 2412px = content (was main.scrollHeight 4831).
  Labels input CSS in `EditLabelsModal.module.css` (outline none, 1px 2px padding, danger text, focus-within border).
  Other `Stack`s in features/admin (not fixed, not verified as bugs): AuditLogPage `InvalidFiltersState`,
  CaCertificatesTable, ClusterDetailsTab, ClusterCredentialsTab, DeleteCredentialModal.

## Review
- 2026-11-24 frontend-architect, round 1: **APPROVE**. Audit footer `Stack` → column `Flex` (spaceItemsMd, mt-md) fixes the
  100%-height blank scroll; `Stack` still used by `InvalidFiltersState`, import correct. Labels CSS checked against PF
  `text-input-group.css`: all overridden vars live on the group root, `.tagsInput.pf-m-error` (0,2,0) beats PF's root
  defaults, inline-end padding correctly skipped in error state, `:focus-within` reuses the m-hover border (red when
  invalid); each rule cites OCP `_label.scss`. Gate: lint/typecheck/build ok; 1 unrelated timeout (`ClusterCredentialsTab.test.tsx:181`, 5s under load) passes in isolation. Visual spot-check of focus/padding left to the UX review.
- Nit (optional): the `.closest('.pf-v6-l-stack')` test asserts a PF class name (implementation detail); fine as a
  regression guard.
- 2026-11-24 ux-designer round 1: **APPROVE**
- Audit log dark 1280: scroller `scrollHeight` 2504 = footer bottom 2488 + 16px section padding; after Load more 4761 = 4745 + 16 (was 4831 blank). Fixed.
- Edit labels (pod db-0, Tab focus, dark): input `outline-style: none`, padding `1px 2px`, single outer box with hover border `rgb(146,197,249)` on focus-within — matches `public/components/utils/_label.scss:47-52` plus the agreed a11y cue.
- Invalid entry: input text danger `rgb(248,155,120)`, group border danger, helper text shown; padding-inline-end 38px reserves the status icon (`_label.scss:54-56`).

## Handover notes
- Focus cue uses `--pf-v6-c-text-input-group--m-hover--BorderColor`, which PF resolves to danger-hover in the error
  state, so invalid entries keep a red border while focused.
- Inline-end padding override applies only when not `pf-m-error` (PF reserves status-icon room there).
- The labels modal could not be measured by the probe (it never clicks); CSS is not evaluated in jsdom, so reviewer
  should spot-check focus ring/padding in the browser.
