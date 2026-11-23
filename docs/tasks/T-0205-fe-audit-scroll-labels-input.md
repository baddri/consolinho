---
id: T-0205
title: Audit log blank scroll after the end; Edit labels input without an inner focus ring
status: todo
owner: frontend-engineer
checkpoint: 4c
depends_on: []
paths: [web/src/features/admin/audit/AuditLogPage.tsx, web/src/features/admin/audit/AuditLogPage.test.tsx, web/src/features/resources/actions/EditLabelsModal.tsx, web/src/features/resources/actions/EditLabelsModal.module.css]
review_rounds: 0
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
- [ ] Audit log: scrolling stops at the end of the footer (probe `main.scrollHeight` vs footer bottom), with and
      without "Load more", light and dark.
- [ ] Edit labels: focused input has `outline-style: none`, no inner box; only the outer box border, which shows
      the hover-colour border while focused; typing/Enter/Backspace/blur behaviour unchanged.
- [ ] Invalid entry: red input text + existing error helper text and red group border.
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
