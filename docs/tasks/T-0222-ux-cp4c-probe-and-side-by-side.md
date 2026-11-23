---
id: T-0222
title: CP4c UX — Terminal/strategy-modal ui-probe, live OCP side-by-side of CP4b pages, UX.md §2a wording
status: todo
owner: ux-designer
checkpoint: CP4c
depends_on: [T-0203, T-0204, T-0205]   # orchestrator: add any later ux shell task (T-0206…T-0209) that lands
paths: [docs/architecture/UX.md, docs/architecture/ocp-parity.md, docs/tasks/]
review_rounds: 0
---

## Goal
Close the ux-side §4b.7/§4b.8 deferrals:
- Measure the Terminal (1280×800) and the Update strategy modal with the style probe.
- Run a live OCP side-by-side of the CP4b pages; T-0200's verdicts were source-based.
- Fix the UX.md §2a band wording.

## Scope
- In:
  - Probe numbers against OCP source/live values.
  - Parity rows updated with live evidence.
  - UX.md §2a corrected: the band is not flush under the masthead; the dark band contrast is 6.72:1 (`#f9a8a8`) per the T-0172 handover.
  - File a fix task for each mismatch (next free T-number, owner frontend-engineer), with its own short fixes.
- Out: code changes beyond trivial CSS values (file tasks instead).

## Context pack
- Tools: `scripts/ui-probe.mjs` (T-0138). Use a read-only live OCP only if the human provides one; otherwise compare against the OCP source and record that.
- Pages: Terminal tab (Pod), `ConfigureUpdateStrategyModal`, StatefulSet/DaemonSet/RS/RC/DC/Job/CronJob/HPA/ConfigMap/Secret details+lists, Search (rows 69-81 in `ocp-parity.md`).
- OCP reference: `/home/bad/works/openshift-console/frontend/public/components/pod-exec.tsx`, `public/components/modals/configure-update-strategy-modal.tsx`, and the kind pages listed in rows 69-81.

## Acceptance criteria
- [ ] The probe tables for Terminal and the strategy modal are in the Work log, and mismatches are fixed or filed.
- [ ] Rows 69-81 carry live (or explicitly source-only) evidence.
- [ ] The UX.md §2a wording is fixed.

## Work log

## Review

## Handover notes
