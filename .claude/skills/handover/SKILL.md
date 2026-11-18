---
name: handover
description: Write a clean FleetConsole session handover — update docs/process/HANDOVER.md, task files and ROADMAP so the next session (or a human) can resume exactly where work stopped.
---

1. `git status` / `git log --oneline -10`. Commit approved work; for unapproved WIP, leave it uncommitted only if it is
   described in the task's Handover notes — otherwise stash with a descriptive message and record the stash name.
2. Every task with `status: in_progress` or `in_review` must have current **Work log** and **Handover notes**.
3. Rewrite `docs/process/HANDOVER.md` (keep it under ~60 lines): last updated date, current checkpoint + loop step,
   branch, in-flight table, **Next actions** as concrete numbered first steps, **Needs human**, **Gotchas** learned
   this session (keep earlier gotchas that still apply).
4. Update `docs/plan/ROADMAP.md` statuses if they changed.
5. Commit doc updates: `docs: handover <date>`.
