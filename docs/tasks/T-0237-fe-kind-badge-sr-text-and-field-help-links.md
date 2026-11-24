---
id: T-0237
title: Kind badge screen-reader text; field-help popover linkifies URLs and keeps line breaks
status: todo
owner: frontend-engineer
checkpoint: 4c
depends_on: []
paths: [web/src/shared/ui/kind-badge, web/src/shared/ui/page/DetailsGrid.tsx]
review_rounds: 0
---

## Goal
Two small details-page gaps found in the T-0222 side-by-side. (1) `KindBadge` is `aria-hidden`, so screen readers hear
"web" where OCP reads "Deployment web". (2) The field-help popover prints "More info: https://…" as plain text. OCP
makes it a link and keeps the schema's line breaks.

## Scope
- In: an sr-only kind name before the badge (everywhere `KindBadge` renders: h1, links, ContainerLabel); the popover
  body linkify and pre-line.
- Out: badge visuals.

## Contract / design notes
- OCP `public/components/utils/resource-icon.tsx`: `<span className="pf-v6-u-screen-reader">{kindStr}</span>` before the
  badge. Measured live: the deployment h1 contains the sr text "Deployment". Use PF `pf-v6-u-screen-reader`. Keep the visual badge `aria-hidden`.
- OCP `details-item.tsx` popover body: `<LinkifyExternal><div className="co-pre-line">{description}</div></LinkifyExternal>`
  (`co-pre-line` = `white-space: pre-line`). Links open in a new tab with the external-link icon. Prefer a small, maintained
  linkify library (for example `linkify-react`) or a tiny URL regex in shared code. Check with the frontend architect.
- Popover min-width: OCP measured 332px vs ours unset. Re-measure after linkify. If it still differs, it is a PF 6.6/6.7
  delta: record it, don't fix it.

## Context pack
- Touch points: `web/src/shared/ui/kind-badge/KindBadge.tsx`, `web/src/shared/ui/page/DetailsGrid.tsx` (field-help Popover body).
- Tests asserting accessible names that will now include the kind (`getByRole('heading', { name })`). Update them.

## Acceptance criteria
- [ ] The details h1 accessible name is "Deployment web" (an RTL test). Badge links read "<Kind> <name>".
- [ ] A popover description with a URL renders an external link. Newlines in descriptions are preserved.
- [ ] Build, lint and tests green (CLAUDE.md rule 4).

## Work log

## Review

## Handover notes
