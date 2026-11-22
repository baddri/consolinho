---
id: T-0137
title: Cut token cost of the agent workflow (process rules)
status: done
owner: orchestrator
checkpoint: 3.6
depends_on: []
paths: [CLAUDE.md, docs/process/SDLC.md, .claude/agents, .claude/skills/continue, .claude/settings.json]
review_rounds: 0
---

## Goal
Transcript analysis (17 sessions, 243 subagent runs, 2026-11-23): cost ≈ turns × context, not reads (text reads <1%).
frontend-engineer = 34% of spend; its turns/run grew 57 → 89 → 136 (CP3 → CP3.5 → CP3.6) at ~104k context, driven by
ad-hoc Playwright scripts, ~8 dev-server starts per run, 1.05 tool calls per turn, ~1 CHANGES_REQUESTED per task
(T-0126: 4 rounds, new findings in later rounds), and 590 screenshot reads kept in context. Fix the process side;
tooling is T-0138. Model/effort changes deliberately out of scope (human, 2026-11-23).

## Changes
- `CLAUDE.md` §Context & token discipline: parallel tool calls / chained shell steps; screenshot rules.
- `SDLC.md` §Review checklists: "Review rounds converge", "Task size"; compaction window 250k → 150k.
- Agents: architects + ux-designer reference both rules; ux-designer puts measured OCP CSS values into task context
  packs and measures with the probe first; frontend-engineer runs the probe before handoff, no ad-hoc servers/scripts.
- `/continue`: session budget, no images/process babysitting in the orchestrator, round-1 findings passed to re-reviews.

## Handover notes
- Measure effect at the end of the next UI checkpoint: frontend-engineer turns/run (target ≤ ~70), CR rounds/task
  (target ≤ 0.5), PNG reads/run. The analysis script lives only in a session scratchpad; rerun from transcripts.
