---
id: T-0414
title: CP6 security review — ASVS L2 pass over auth, proxy, admin; dated section in SECURITY.md
status: todo
owner: backend-architect
checkpoint: 6a
depends_on: [T-0400, T-0401, T-0402, T-0403, T-0405, T-0409, T-0411, T-0413]
paths: [docs/architecture/SECURITY.md, docs/tasks]
review_rounds: 0
size: M (1 d)
---

## Goal
An explicit, dated security review before CP6 closes (spec SRV-1, SRV-3), covering the CP6a changes and the existing surface.

## Contract / design notes
- Checklist: OWASP ASVS 4.0 L2 chapters V2 (auth), V3 (session), V4 (access control), V5 (validation), V7 (logging),
  V8 (data protection), V9 (communication), V13 (API), V14 (config). For each: pass / gap / n.a. with a code or test reference.
- Specific probes: forwarded-header spoofing (FWD), limiter bypass (path case, `//`, encoded verbs, WebSocket upgrade),
  discovery cache cross-credential leakage, `/metrics` reachability through the Route, CSRF on new 429 paths, SA-token
  leak sweep result (T-0411), `check-deps.sh` result (T-0413).
- Output: `SECURITY.md` § "CP6 review (YYYY-MM-DD)" ≤ 60 lines (table + residual risks). Every High → new task file
  (next free T-04xx) linked from the section; Medium/Low listed with a decision (fix now / accept / later CP).

## Acceptance criteria
- [ ] SRV-1: section present, dated, ASVS chapters covered with references.
- [ ] SRV-3: no open High without a task; accepted risks named with rationale.

## Work log

## Review

## Handover notes
