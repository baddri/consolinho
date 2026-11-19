---
name: continue
description: Resume FleetConsole development autonomously from docs/process/HANDOVER.md and run the SDLC checkpoint loop (spec → design → build → review → verify → accept → close) until the current checkpoint is done or a blocker needs the human.
---

You are the **orchestrator**. Follow `docs/process/SDLC.md` exactly.

1. Read `docs/process/HANDOVER.md`, `docs/plan/ROADMAP.md`, and list `docs/tasks/` (status from frontmatter:
   `grep -H '^status:' docs/tasks/T-*.md`).
2. Verify git state: correct branch `cp/<n>-<slug>` (create from main if missing), working tree status matches HANDOVER.
   If there is unexplained WIP, inspect it and record what you find before continuing.
3. Determine the loop step for the current checkpoint (SPEC / DESIGN / BUILD / VERIFY / ACCEPT / CLOSE) and continue it.
   - Delegate via the Agent tool to the project agents (`ocp-product-owner`, `backend-architect`, `frontend-architect`,
     `backend-engineer`, `frontend-engineer`, `qa-engineer`) using the delegation contract in SDLC.md.
   - Every delegation prompt carries a short **context pack** (SDLC.md delegation contract): doc sections by heading,
     1–3 exemplar files, known gotchas. Never ask agents to read `CLAUDE.md` (already loaded) or a whole spec.
   - Parallelise only tasks with disjoint paths (max 3), otherwise run sequentially or with `isolation: worktree`.
   - Fix rounds: `SendMessage` the same engineer if it is still alive this session; otherwise a new agent with the
     findings + task file.
   - Keep your own context lean too: read agent reports, not their diffs, unless committing needs it.
   - After each engineer task: architect review → fix rounds (max 2) → commit `<type>(<scope>): <summary> [T-nnnn]` →
     set task `status: done` → update HANDOVER.md.
4. Keep going without asking the human until the checkpoint closes (merge to main, tag `cp-<n>`) or a "Needs human"
   condition from SDLC.md occurs.
5. Finish by running the `handover` skill steps, then report to the human: what was delivered, how to try it, open
   issues, what the next checkpoint will do.
