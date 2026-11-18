---
id: T-0006
title: "[label: bug] Sidebar version footer is clipped when the version contains a commit SHA"
status: todo
owner: frontend-engineer
checkpoint: 0
depends_on: []
paths: [web/src/app/layout/]
review_rounds: 0
---

## Goal
The sidebar footer (`SystemInfoFooter`) shows `FleetConsole <version> · <environment>`. Builds from git produce an
informational version with the full 40-character commit SHA (`1.0.0+dc5aff8da720c3d4249989d27d74a6aa9435ea6b`). This
string has no break opportunities, so it overflows the sidebar and is cut off at the sidebar edge: part of the SHA is
never visible and nothing shows the full value. Severity: **minor / cosmetic, non-blocking for CP0** (criterion 7 is
still met: the value is loaded through the Vite proxy).

## Repro
1. `aspire start --launch-profile http && aspire wait web`; open the `web` URL from `aspire describe`, e.g.
   `http://localhost:<port>/c/prod-eu-1/overview`, at 1400x900.
2. Look at the sidebar footer.

- **Expected:** the version is fully readable, either wrapped or truncated with the full value available (tooltip),
  inside the sidebar bounds.
- **Actual:** `FleetConsole` / `1.0.0+dc5aff8da720c3d4249989d27d74a6aa94` with the remaining characters clipped at the
  sidebar edge (QA screenshot taken with headless Firefox during CP0 VERIFY).

## Suspected location
`web/src/app/layout/SystemInfoFooter.tsx`: renders the raw version in a `Content component="small"` with no
truncation or wrapping. Suggested fix: show a short form (`1.0.0+dc5aff8`, i.e. the SHA cut to 7 characters) and put
the full value in a PatternFly `Tooltip`, or use PatternFly `Truncate`. Keep the change in the footer. Changing
`HostAppEnvironment` in the backend would change the API value, which is a contract decision for the backend-architect.

## Acceptance criteria
- [ ] With a 40-char SHA version, the footer stays inside the sidebar and the full version can be seen (tooltip or wrapping)
- [ ] Component test in `web/src/app/layout/SystemInfoFooter.test.tsx` with a long SHA version (MSW)
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-18 qa-engineer: found during CP0 VERIFY (criterion 7 browser check).

## Review

## Handover notes
