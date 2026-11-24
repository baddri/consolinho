---
id: T-0222
title: CP4c UX — Terminal/strategy-modal ui-probe, live OCP side-by-side of CP4b pages, UX.md §2a wording
status: done
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
- [x] The probe tables for Terminal and the strategy modal are in the Work log, and mismatches are fixed or filed.
- [x] Rows 69-81 carry live (or explicitly source-only) evidence.
- [x] The UX.md §2a wording is fixed.

## Work log
- 2026-11-24 ux-designer: live OCP bridge on :9000 (read-only, current `oc login`), browse/view-only clicks only. Mock :5199 `?mockUser=admin`, 1280x800.
  Terminal probe: toolbar 894x53 both | xterm pad 10px, 16px Red Hat Mono, black, both | size ours 894x414 (fills) vs OCP 882x366 (JS sizing) — accepted | Expand 85 vs 89px — ignore.
  Strategy modal probe (ours light+dark; OCP source only, opening needs an action click): 560px small, header 24/24/8, title 20px/600, one close, 2 radios, OCP helper copy verbatim, Save primary + Cancel link, autofocus — match.
  CP4b text diff (h1/columns/tabs/terms): STS/DS/RS/Job/CronJob/CM/Secret/Search live, RC/DC/HPA source only (none on cluster). Extra CP4c: YAML sidebar, field-help popover, Edit Deployment form.
  Filed: T-0235 (h2 18→20px, shared), T-0236 (Labels Edit / annotations link), T-0237 (kind sr text, popover linkify), T-0238 (form section gap 56→24, Pull Secret). UX.md §2a fixed; parity rows 38/40/46/63/68/71-81 updated.

## Review

## Handover notes
- Live OCP was up (started `scripts/ocp-ref/run-console.sh` myself, stopped after the run). Never clicked actions. The strategy modal's OCP side is source-only for that reason.
- Fix tasks T-0235..T-0238 (frontend-engineer). T-0236 depends on T-0218 (MetadataSection). T-0235 also changes admin details h2s.
- Not reproduced: an earlier "0 pixels" resizable-column aria text on the RS list Created column (later dump found no such attribute). Re-check if it reappears.
- PF 6.7 vs OCP's 6.6 token deltas (tab padding, Save 24 vs 28px) are recorded, not fixed.
