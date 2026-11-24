---
id: T-0237
title: Kind badge screen-reader text; field-help popover linkifies URLs and keeps line breaks
status: done
owner: frontend-engineer
checkpoint: 4c
depends_on: []
paths: [web/src/shared/ui/kind-badge, web/src/shared/ui/page/DetailsGrid.tsx]
review_rounds: 1
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
- [x] The details h1 accessible name is "Deployment web" (an RTL test). Badge links read "<Kind> <name>".
- [x] A popover description with a URL renders an external link. Newlines in descriptions are preserved.
- [x] Build, lint and tests green (CLAUDE.md rule 4).

## Work log
- 2026-11-24 frontend-engineer: `KindBadge` renders `pf-v6-u-screen-reader` kind + a space text node before the aria-hidden pill; popover body linkifies URLs with `ExternalLinkButton` (react-component-groups, already a dep; no new package). Updated heading-name / row-text tests and `withoutBadges`.

## Review
- 2026-11-24 frontend-architect, round 1: **APPROVE**. The `pf-v6-u-screen-reader` kind comes before the aria-hidden pill, as in OCP `resource-icon.tsx:20`. The separate `' '` text node is correct: without it the name computes as "Deploymentweb". It stays invisible because the out-of-flow sr span lets the space collapse at line start or next to existing spaces ("Labels for ", "Container: "), and a whitespace-only flex item is dropped. The popover body matches OCP `details-item.tsx` (`LinkifyExternal` + `co-pre-line`) and uses the existing `ExternalLinkButton` (no new dependency). The test covers href, `_blank`, rel, newlines and trailing punctuation.
- Deviations accepted: links keep their own name and the badge sits beside the link, as in OCP `ResourceLink`. Option names now include the kind; the orchestrator updated `EditDeploymentPage.test.tsx` L522/532/533.
- Nit (optional): `DetailsGrid.tsx:76` — move `URL_PATTERN`/`LinkifiedText` to `shared/ui/text` if a second caller appears. Popover min-width is still not re-measured.

## Handover notes
- The space is a separate text node, not inside the sr span: dom-accessibility-api (and Chrome) trim per element, so "Deploymentweb" otherwise. It is invisible (out-of-flow sr span / whitespace-only flex item).
- Options with a badge now read the kind too (e.g. "ConfigMap web-config"), as OCP. **`deployments/form/EditDeploymentPage.test.tsx` L522/L532** need `name: 'ConfigMap web-config'` (that folder is owned by another task; not touched).
- Links keep their own name ("web"): the badge sits beside the link, not in it, as in OCP `ResourceLink`; the row/cell reads "Deployment web". Playwright `exact` link names stay valid.
- Popover min-width not re-measured (OCP ref console down).
