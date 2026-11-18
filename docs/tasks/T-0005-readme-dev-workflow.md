---
id: T-0005
title: README and verified developer workflow
status: todo
owner: backend-engineer
checkpoint: 0
depends_on: [T-0004]
paths: [README.md, docs/dev/]
review_rounds: 0
---

## Goal
A new developer (or Claude session) can go from clone to running app and green tests by following README.md.

## Scope
- Root `README.md`: what FleetConsole is (2 paragraphs), prerequisites (.NET 10 SDK, Aspire CLI, Node 22, podman),
  podman socket + env vars, `aspire run`, URLs (dashboard, web, api), running tests, regenerating API types,
  repo map, links to CLAUDE.md / docs / SDLC.
- Actually perform the steps: start `aspire run` in the background, confirm Postgres, Api `/health` and the web dev
  server respond, then stop it. Record exact commands/outputs in the Work log; fix doc steps that didn't work.
- `docs/dev/TROUBLESHOOTING.md` for issues hit along the way.

## Acceptance criteria
- [ ] Spec CP0 criterion 9 satisfied; criterion 7 demonstrated with recorded evidence
- [ ] Build + tests green

## Work log

## Review

## Handover notes
