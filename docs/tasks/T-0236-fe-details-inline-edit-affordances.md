---
id: T-0236
title: Details metadata — inline Labels "Edit" and "N annotations" edit links like OCP
status: todo
owner: frontend-engineer
checkpoint: 4c
depends_on: [T-0218]
paths: [web/src/features/resources/details, web/src/shared/ui/page]
review_rounds: 0
---

## Goal
OCP's details metadata block lets a user with patch access edit labels and annotations in place. Ours lists the
annotations in an ExpandableSection and has no edit affordance. An OCP user expects "Edit" next to Labels and a
clickable "N annotations" (found in the T-0222 live side-by-side).

## Scope
- In: Labels term "Edit" button → existing `EditLabelsModal`; Annotations value → inline link "N annotation(s)" with an
  end edit icon → existing `EditAnnotationsModal`; Tolerations value → the text "N toleration(s)".
- Out: a tolerations modal (no OCP-like modal exists yet). Show the count as plain text even with access, and note the
  deviation in parity row 38.

## Contract / design notes
- OCP `public/components/utils/details-page.tsx:87-150`, `details-item.tsx:95-125` (`editAsGroup`). Gate everything on
  `canUpdate` = an `update`/patch access review on the resource (reuse the hook the Actions menu uses). Without access,
  render plain text: `{{count}} annotation` (pluralised) and no Edit button.
- Measured live (OCP deployment consolinho, 1280):
  - Labels dt = `Split pf-v6-u-w-100` → fill item (help-text popover button "Labels") + item with
    `Button variant="link" isInline` "Edit" plus the edit icon at the end (`data-test="Labels-details-item__edit-button"`).
  - The dd gets `co-editable-label-group` (pad 4px).
  - Annotations: `<Button variant="link" isInline icon={edit} iconPosition="end">2 annotations</Button>`, 14px/400,
    link colour, gap 8px, `data-test="edit-annotations"`.
- Keep the field-help popover on the term (T-0213) working alongside the Edit button.

## Context pack
- Touch points: `web/src/features/resources/details/MetadataSection.tsx` (`Annotations` L20, Labels L81, Tolerations L101,
  Annotations L105), `web/src/shared/ui/page/DetailsGrid.tsx:DetailsItem` (needs an optional term-side action),
  `web/src/features/resources/actions/{EditLabelsModal,EditAnnotationsModal,useResourceActions}.tsx` (how the modals open, plus the access check).
- OCP: `details-page.tsx:ResourceSummary`, `details-item.tsx:DetailsItem`, `public/components/utils/inline-edit-button` (if present).

## Acceptance criteria
- [ ] Admin (`?mockUser=admin`): Labels shows "Edit", which opens Edit labels. Annotations shows "N annotations" plus the icon, which opens Edit annotations.
- [ ] A user without patch access (`?mockUser=alice` on a read-only namespace): no Edit, plain "N annotations".
- [ ] Probe vs OCP deployment details: dt row height 21px, link 14px/400. Both themes.
- [ ] Build, lint and tests green (CLAUDE.md rule 4).

## Work log

## Review

## Handover notes
