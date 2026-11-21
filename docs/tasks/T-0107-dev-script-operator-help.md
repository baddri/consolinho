---
id: T-0107
title: deploy-dev.sh --help in operator language, with examples
status: todo
owner: backend-engineer
checkpoint: 6
depends_on: []
paths: [scripts/deploy-dev.sh]
review_rounds: 0
---

## Goal
`scripts/deploy-dev.sh --help` prints the whole header comment: AC ids (DEV-1..9, SMK-1, CFG-3/4), ADR numbers and
agent rules ("orchestrator", "CLAUDE.md rule 6"). An admin on a freshly installed test cluster has to read past
that to find the usage. Found in CP3 PO acceptance.

## Scope
- In: `--help` starts with the usage and flags, then 3 examples (first deploy, re-deploy after code changes,
  `--admin alice`), what gets created (namespace, OAuthClient, generated Secrets, where the CA bundle copy is) and a
  pointer to `docs/ops/RUNBOOK.md` §3. AC ids, ADR refs and agent rules stay as `#` comments that `--help` doesn't print.
- Out: new flags or behaviour changes.

## Acceptance criteria
- [ ] `--help` output has no AC ids, ADR numbers or agent/CLAUDE.md references and is ≤ 30 lines.
- [ ] Usage line and flags come first; at least two runnable examples.
- [ ] `scripts/check-deploy.sh` green (shellcheck).

## Work log

## Review

## Handover notes
