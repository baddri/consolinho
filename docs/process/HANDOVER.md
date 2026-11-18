# HANDOVER — live project state

> Updated by the orchestrator after every completed task and at session end. Keep it short; details belong in task files.

**Last updated:** 2026-11-18 · **Current checkpoint:** CP0 — Foundations · **Branch:** `cp/0-foundations`

## Where we are
- Project operating system created: CLAUDE.md, architecture docs, ADR-0001..0006, SDLC, ROADMAP, agents, skills.
- CP0 tasks T-0001..T-0005 created (`docs/tasks/`). Loop step: **BUILD**.

## In flight
| Task | Status | Owner | Note |
|---|---|---|---|
| — | | | |

## Next actions
1. Run `/continue`: execute CP0 BUILD tasks in dependency order (T-0001 and T-0003 can run in parallel).

## Needs human
- (none)

## Gotchas
- No docker on the dev machine: use podman (see CLAUDE.md "Podman notes").
- Root namespace is `FleetConsole` (not `Console`, which collides with `System.Console`).
