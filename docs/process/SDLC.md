# SDLC — how work runs (autonomously, across many sessions)

The project is built by one **orchestrator** (the main Claude session) delegating to **role subagents**
(`.claude/agents/`). All state lives in files so any new session — or any human — can pick up exactly where work stopped.

## Sources of truth

| File | Owner | Purpose |
|---|---|---|
| `docs/plan/ROADMAP.md` | orchestrator | Checkpoints, their goals, exit criteria, status |
| `docs/specs/CP<n>-*.md` | ocp-product-owner | What to build and why; user stories + acceptance criteria |
| `docs/tasks/T-<nnnn>-<slug>.md` | architects create, engineers/QA update | One unit of work; status, criteria, work log, handover notes |
| `docs/adr/*.md` | architects | Decisions |
| `docs/process/HANDOVER.md` | orchestrator | Live state: current checkpoint, in-flight tasks, next actions, blockers. **Always current.** |

## Task lifecycle

```
todo ──► in_progress ──► in_review ──► done
  ▲           │              │
  │           ▼              ▼ (changes requested, max 2 rounds → then blocked)
  └──── blocked ◄────── in_progress
```

Task file format: see `docs/tasks/_TEMPLATE.md`. Frontmatter `status`, `owner` (agent), `checkpoint`, `depends_on`.
A task is **Ready** when it has: clear goal, acceptance criteria, affected paths, dependencies done, and (for API
work) the contract (route, request/response shape, errors).
A task is **Done** when: criteria met, build + lint + tests green, docs/comments updated, architect review APPROVED,
committed, task file work log updated.

## The checkpoint loop (orchestrator)

```
0. Read HANDOVER.md, ROADMAP.md. Ensure branch cp/<n>-<slug> exists and is checked out.
1. SPEC     — if docs/specs/CP<n>-*.md missing: ocp-product-owner writes it.
2. DESIGN   — if tasks for CP<n> missing: backend-architect and frontend-architect (parallel) produce
              ADRs (if needed) + task files with contracts. Orchestrator reconciles FE/BE contracts.
3. BUILD    — repeat until no `todo` tasks remain in CP<n>:
              a. pick ready tasks (deps done). Run in parallel only if they touch disjoint paths
                 (src/+tests/ vs web/) — max 3 concurrent backend/doc agents plus 1 frontend (web/-only) agent; same-area parallel work uses isolation: worktree.
              b. engineer agent implements → sets status in_review, fills work log.
              c. architect agent reviews `git diff` for that task → APPROVE or CHANGES_REQUESTED (findings list).
              d. on changes: same engineer type fixes (max 2 rounds; then mark blocked + note in HANDOVER).
              e. on approve: orchestrator commits (`<type>(<scope>): <summary> [T-nnnn]`), sets status done,
                 updates HANDOVER.md.
4. VERIFY   — qa-engineer runs the full suite, checks every acceptance criterion in the spec, adds missing tests,
              files bug tasks (`T-nnnn`, label bug) → back to BUILD if any.
5. ACCEPT   — ocp-product-owner reviews the delivered feature (code, screenshots if available) against the spec.
              Improvement ideas become tasks for later checkpoints (don't block unless a criterion fails).
6. CLOSE    — ROADMAP status → done, merge cp branch into main (fast-forward / --no-ff), tag cp-<n>,
              HANDOVER updated with "next checkpoint". **Stop and report to the human.**
```

The orchestrator runs this loop **without asking the human** until the checkpoint closes, except for:
- a decision that changes scope, stack or security model and isn't covered by an ADR;
- missing access/credentials/environment the agents can't create;
- the same task failing review/QA 3 times.
In those cases: record in HANDOVER "Needs human", continue with other unblocked tasks if any, then stop.

## Delegation contract (every subagent prompt includes)

1. The task file path(s) and the instruction to read `CLAUDE.md` + the relevant architecture doc first.
2. Scope boundary: which directories it may change.
3. Required checks to run before finishing (from CLAUDE.md rule 4).
4. Before returning: update the task file (status, **Work log**, **Handover notes**: what's done, what's not, gotchas).
5. Final report format:
   ```
   STATUS: done | partial | blocked
   CHANGED: <files/dirs>
   CHECKS: <command → result>
   NOTES: <decisions, deviations, follow-ups>
   ```

Subagents do **not** commit, do not edit HANDOVER.md or ROADMAP.md, and do not spawn other agents.

**Agent registration fallback:** project agents in `.claude/agents/` are loaded at session start. If the Agent tool
reports the type as not found (e.g. agents edited mid-session), spawn `general-purpose` and begin the prompt with
"First read `.claude/agents/<name>.md` and adopt that role and its rules completely."

## Commits & branches

- Branch per checkpoint: `cp/<n>-<slug>`. Commit per approved task. Conventional commits with task id.
- Merge to `main` at checkpoint close, tag `cp-<n>`. Never force-push. Never rewrite main history.
- The human has authorized the orchestrator to commit and merge locally as part of this loop; **pushing to a remote
  requires the human's explicit request.**

## Session boundaries & context hygiene

- HANDOVER.md is updated after **every** completed task (cheap insurance against context loss or a crashed session).
- Long checkpoints span many sessions; nothing important may live only in conversation memory.
- Subagent outputs are summarized into task files, not pasted into HANDOVER.
- At session end (`/handover` skill): make sure no task is left `in_progress` without handover notes, working tree
  is clean or the WIP is described, HANDOVER "Next actions" lists concrete first steps.
- To resume (`/continue` skill): read HANDOVER → verify git state matches → continue the loop at the recorded step.

## Review checklists

**Backend review** (backend-architect): layering respected; use case is a command or a query; invariants in aggregate;
cross-cutting logic in behaviors/policies; Result/ProblemDetails used; CancellationToken passed; XML docs present and
accurate; no secrets logged; tests cover happy path + main failures; migrations included when model changed.

**Frontend review** (frontend-architect): feature boundaries; data via shared/k8s or shared/api only; query keys include
cluster; loading/error/empty states; no `any`, no DOM selectors; PatternFly components used idiomatically; a11y labels;
tests with MSW; TSDoc on components/hooks.
