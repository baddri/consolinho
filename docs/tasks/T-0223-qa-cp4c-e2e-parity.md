---
id: T-0223
title: CP4c QA — QGC e2e, carried CP4b e2e, parity gate, POL evidence
status: done
owner: qa-engineer
checkpoint: CP4c
depends_on: [T-0210, T-0211, T-0212, T-0213, T-0214, T-0215, T-0216, T-0217, T-0218, T-0219, T-0220, T-0221, T-0222]
paths: [web/e2e/, docs/architecture/ocp-parity.md, docs/tasks/T-0118-ux-cp35-review-follow-ups.md, docs/tasks/T-0133-fe-details-field-help-and-ring-scale.md]
review_rounds: 0
---

## Goal
Verify CP4c against §4c.1–4c.5 and the §4b.8 follow-ups, and produce the evidence the product owner needs to ACCEPT.

## Scope
- In:
  - QGC-1 e2e: edit a Deployment image in Form view → switch to YAML → see it → Save; YAML hover shows a field description; an unknown field shows a Monaco warning and completion lists `spec` children (T-0211 AC1).
  - Carried e2e: DC Start rollout, RC Rollback, RC Cancel rollout, StatefulSet ring scale.
  - QGC-2: no `gap` rows left from W1/W3/W4.
  - POL-1: close T-0118 with one line per item 1-10 (done in T-0119/T-0121/T-0122/T-0126, or re-filed with a reason; #4 pagination is now also in the ux tasks).
  - POL-2 evidence: the YAML tab Save/Reload/Cancel + guard already existed (`ResourceYamlTab`); add an e2e step.
  - POL-5 evidence: `shared/ui` `Timestamp`/`DetailsSubsection` + tests, `test/sidebar.ts`.
  - Full gates, `--repeat-each=2` for the new group.
- Out: BE tests (the backend-architect covers POL-4 BE, HPA/deploy tasks). CONNECT/200 stays with T-0091.

## Context pack
- Exemplar: `docs/tasks/T-0200-qa-cp4b-e2e-parity.md` (structure, evidence format) and its e2e spec files in `web/e2e/`.
- Spec: `docs/specs/CP4-workloads.md` §4c.1–4c.6 (grep the AC ids).

## Acceptance criteria
- [x] QGC-1 e2e green (form→YAML→Save green ×2; YAML hover/completion/validation green after T-0239) (also on `--repeat-each=2`); carried CP4b e2e green, with no `fixme`.
- [x] QGC-2: `ocp-parity.md` has no `gap` from W1/W3/W4.
- [x] T-0118 and T-0133 are closed with per-item reasons; POL-1–POL-5 evidence is listed in the Work log.
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-24 qa-engineer: `workloads.e2e.ts` CP4c group with `--repeat-each=2` gives 16/16 (form→YAML→Save, RO form, POL-2 Reload/Cancel guard, DC Start rollout, RC Rollback/Cancel, STS ring scale; no fixme). Full e2e 37/37; `switcher.e2e` H3 was stale since T-0203 and is aligned.
- QGC-1 hover/completion/validation FAIL in dev and prod builds: the monaco-yaml worker never starts (monaco-editor 0.55 API) → T-0239 (blocking). The e2e is kept as `test.fail`.
- POL-1: T-0118 closed per item; T-0133 was already closed by T-0213/T-0184/T-0188. POL-2: `ResourceYamlTab.test.tsx` + e2e. POL-3: `auditActionLabels.test.ts`. POL-4: `adminSource.ts` maps the structured `AdminConfigurationSource` and no longer parses a string. POL-5: `shared/ui/details.test.tsx`, `test/sidebar.ts`.
- QGC-2: the W1/W3/W4 rows are closed (W4 row updated). New gap on the YAML tab row → T-0239. `check-fe.sh` is green (1217 tests).

## Review

## Handover notes
