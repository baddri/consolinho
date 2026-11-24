---
id: T-0235
title: Section headings use OCP's 20px h2 with a full-width flex row
status: done
owner: frontend-engineer
checkpoint: 4c
depends_on: []
paths: [web/src/shared/ui/page, web/src/features/admin/clusters/CaCertificatesTable.tsx, web/src/features/resources/configs]
review_rounds: 1
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
- [x] Details h2s measure 20px/26px/600, margin-bottom 16px, in light and dark (probe vs OCP deployment and secret details).
- [x] The heading row with actions is full content width, with the actions right-aligned. The Reveal button padding is 8px.
- [x] Tests that assert heading size/classes updated. Build, lint and tests green (CLAUDE.md rule 4).

## Work log
- 2026-11-24 frontend-engineer: dropped `size="lg"` from `SectionHeading` (both branches) and the CA certificates h2 (PF default `pf-m-h2`); removed the Reveal button `pf-v6-u-pr-0`. Probe (ours, both themes): h2 20/26/600, mb 16px; Data row 894px space-between; Reveal padding 8px. OCP ref console was down, compared with the T-0222 numbers.

## Review
- 2026-11-24 frontend-architect, round 1: **APPROVE**. `SectionHeading` (both branches) and the CA h2 drop `size`, so they use PF's default `pf-m-h2`, which matches OCP `SecondaryHeading` (no size). The Reveal button `pf-v6-u-pr-0` is removed, so padding is 8px. The actions stay a sibling in the full-width space-between Flex, as the contract allows. No custom CSS. `scripts/check-fe.sh` is green (1223 tests).
- Nit (optional): AC 1 was compared with the T-0222 numbers, not a live OCP probe. Confirm it in the next live UX pass.

## Handover notes
- Secret Reveal stays a sibling of the h2 (accessible name), per the contract. Context-pack path `resources/configs` is really `resources/workloads/config`.
- No test asserted the size class, so none needed updating.
