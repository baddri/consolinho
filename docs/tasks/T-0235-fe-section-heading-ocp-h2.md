---
id: T-0235
title: Section headings use OCP's 20px h2 with a full-width flex row
status: todo
owner: frontend-engineer
checkpoint: 4c
depends_on: []
paths: [web/src/shared/ui/page, web/src/features/admin/clusters/CaCertificatesTable.tsx, web/src/features/resources/configs]
review_rounds: 0
---

## Goal
Every details-page section heading ("Deployment details", "Data", "Containers", …) is 18px (`Title size="lg"`). OCP's
`SecondaryHeading` is 20px. This is the largest visible delta from the T-0222 live side-by-side. It makes the
"match" in parity row 38 stale.

## Scope
- In: `SectionHeading` (both branches), `CaCertificatesTable` h2, the Secret "Reveal values" heading row.
- Out: empty-state titles, YAML sidebar h2 (already 20px), form section titles (already 20px).

## Contract / design notes
- OCP `packages/console-shared/src/components/heading/SecondaryHeading.tsx`: `<Title headingLevel="h2" className="co-section-heading">`
  with no `size`. That renders `pf-m-h2`, measured live: **20px / line-height 26px / weight 600 / margin 0 0 16px**.
- `.co-section-heading` (`public/style/_common.scss:48`): `display:flex; justify-content:space-between;
  margin:0 0 var(--pf-t--global--spacer--md) 0`. Actions such as Secret "Reveal values" sit **inside** the full-width
  (894px at 1280) h2, at the right. Ours keeps the actions as a sibling of the h2 for the accessible name. That's fine,
  as long as the row is full width, space-between, and the h2 is 20px.
- Use the PF prop (drop `size="lg"`, or `size="xl"` if the default is not h2). No custom CSS.
- Secret Reveal button padding: OCP 8px all round, ours 8px 0 8px 8px. Match it (drop any `pf-m-inline`/padding override).

## Context pack
- Touch points: `web/src/shared/ui/page/SectionHeading.tsx` (L20, L33), `web/src/features/admin/clusters/CaCertificatesTable.tsx:65`,
  the users: `ResourceDetailsTab.tsx`, `DetailsSubsection.tsx`, `ClusterDetailsTab.tsx`, `UserDetailsTab.tsx`, and the Secret data section.
- OCP: `SecondaryHeading.tsx`, `public/components/secret.tsx` (Reveal values in heading).
- Probe: `node scripts/ui-probe.mjs` on `/k8s/ns/consolinho/deployments/consolinho` vs ours `deployments/web`; h2 fontSize 20px, height 26px.

## Acceptance criteria
- [ ] Details h2s measure 20px/26px/600, margin-bottom 16px, in light and dark (probe vs OCP deployment and secret details).
- [ ] The heading row with actions is full content width, with the actions right-aligned. The Reveal button padding is 8px.
- [ ] Tests that assert heading size/classes updated. Build, lint and tests green (CLAUDE.md rule 4).

## Work log

## Review

## Handover notes
