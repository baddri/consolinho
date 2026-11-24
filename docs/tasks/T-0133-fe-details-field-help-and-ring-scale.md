---
id: T-0133
title: Details field help popovers and deployment pod-ring scale buttons (parity-matrix gap rows)
status: done
owner: frontend-engineer
checkpoint: 4
depends_on: []
paths: [web/src/features/resources]
review_rounds: 0
---

## Goal
Two `ocp-parity.md` rows remain `gap` without a human waiver (CP3.6 verify, 2026-11-22): "Details DescriptionList" (no
field help popovers, T-0122 #8) and "Deployment details" (no pod-ring scale up/down buttons). Ring scaling is a
mutation and belongs with CP4 scale; field help needs OpenAPI definitions (same source as the waived YAML schema
sidebar). The human must waive both rows for CP3.6 or accept this task in CP4.

## Scope
- In: dashed-underline term + popover with the OpenAPI description (OCP `details-page.tsx` `DetailsItem`);
  ring scale buttons on Deployment details for read-write grants only (OCP `deployment.tsx` `PodRingSet`).
- Out: metrics.

## Acceptance criteria
- [ ] Pod and Deployment details terms show OCP's help popovers where OpenAPI has a description.
- [ ] Ring scale buttons hidden/disabled for read-only grants; request uses the scale subresource.
- [ ] Parity rows updated to `match`.
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-22 qa-engineer: filed from CP3.6 verify (`docs/specs/CP3.6-verify.md`).
- 2026-11-24 frontend-engineer: closed — superseded by T-0213 (help) / T-0184+T-0188 (ring scale).

## Review

## Handover notes
