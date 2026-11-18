---
id: T-0006
title: "[label: bug] Sidebar version footer is clipped when the version contains a commit SHA"
status: done
owner: frontend-engineer
checkpoint: 0
depends_on: []
paths: [web/src/app/layout/]
review_rounds: 2
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
- [x] With a 40-char SHA version, the footer stays inside the sidebar and the full version can be seen (tooltip or wrapping)
- [x] Component test in `web/src/app/layout/SystemInfoFooter.test.tsx` with a long SHA version (MSW)
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-18 qa-engineer: found during CP0 VERIFY (criterion 7 browser check).
- 2026-11-18 frontend-engineer: started; plan = pure `formatVersion` helper (short semver+SHA7) + PF Tooltip with the full value.
- 2026-11-18 frontend-engineer: implemented `formatVersion` + unit tests, `SystemInfoFooter` shows `v<semver>+<sha7>` with a
  focusable PF `Tooltip` holding the full version; component tests (MSW, 40-char SHA, hover + keyboard). lint, typecheck,
  test (52 passed), build green. -> in_review.
- 2026-11-18 frontend-engineer: review round 1 fixes. Dropped the `v` prefix (short form is now `1.0.0+dc5aff8`),
  removed the existing-v branch and its test, restored the original footer strings in tests. Took the optional nit:
  replaced the `tagName === 'SMALL'` matcher with `findByText(/^FleetConsole ·/)` + `toHaveTextContent(...)`.
  lint, typecheck, test (51 passed), build green. -> in_review.

## Review
**2026-11-18 frontend-architect, round 1: CHANGES_REQUESTED**

Checks run by reviewer: `npm run lint && npm run typecheck && npm test -- --run && npm run build` all pass (7 files,
52 tests; the build warns about the existing 574 kB chunk). Real-browser check: `aspire start --launch-profile http`, Api
reports `1.0.0+2f30f38ddf41432f81f62c177064296e955879df`. A headless Firefox screenshot at 1400x900 of
`/c/prod-eu-1/overview` shows `FleetConsole v1.0.0+2f30f38 · Development` on one line, well inside the sidebar. The
clipping is fixed. Afterwards `aspire stop` was run and nothing was left running.

Checklist: the change stays in `app/layout`, and data still comes through `shared/api` `useSystemInfo`. Loading and error
states are unchanged. No `any`, no DOM selectors. TSDoc is present on `VersionLabel`, `SystemInfoFooter` and
`formatVersion`. Tests use MSW. `formatVersion` is pure and covers the edge cases (short SHA, non-hex metadata,
pre-release, empty). `pf-v6-u-text-break-word` is a real PF6 utility, and `patternfly-addons.css` is loaded in
`main.tsx`.

Rulings:
- **Tooltip on a focusable `<span tabIndex={0}>` with the one-line `jsx-a11y/no-noninteractive-tabindex` disable:
  accepted. This is the idiomatic PF6 pattern.** PF's own `Truncate` does the same thing: it puts `tabIndex: 0` on
  the truncated span and wraps it in a `Tooltip` (`@patternfly/react-core` 6.7.0 `Truncate.js:111`). The PF Tooltip
  accessibility guidance says to avoid tooltips on static `span`/`div` "except in cases of truncation", and this is a
  truncation case. The tab stop and tooltip are only added when the value was actually shortened, and the default
  `aria="describedby"` gives screen readers the full value. The disable is scoped and justified in a comment. No change
  needed.
- **Custom text matcher: acceptable, with an optional nit (see below).** A function matcher is a documented RTL
  technique for text split across elements, and the tests still assert user-visible text.
- **Always-on `v` prefix: not accepted (required change 1).**

**Required**
1. `web/src/app/layout/formatVersion.ts:34` (also `:3`, `:22`; `formatVersion.test.ts:4,17-27`;
   `SystemInfoFooter.test.tsx:26,39,...`; `AppShell.test.tsx:77`): problem: adding `v` to every version is an
   unrequested change to visible copy. This task fixes overflow, and its spec names the short form `1.0.0+dc5aff8`.
   The prefix also changes the footer for versions that were never broken (`0.0.0-test`, `9.9.9`), adds a
   case-insensitive `^v` branch plus tests for it, and causes test churn outside the bug (CLAUDE.md rule 3, no drive-by
   changes). Required fix: drop the prefix so that `short` is `<core>[+<metadata, SHA cut to 7>]`. Remove the
   "existing v" branch and its test, and restore the expected strings (`FleetConsole 0.0.0-test · Test`,
   `FleetConsole 9.9.9 · Slow`, `FleetConsole 1.0.0+dc5aff8 · Production`). If product wants a `v` prefix, raise it as
   a separate copy task with `ocp-product-owner`.

**Optional (nits)**
- `SystemInfoFooter.test.tsx:8-9`, `AppShell.test.tsx:75-78`: the matcher is defined twice and depends on
  `tagName === 'SMALL'`, which is PF `Content`'s internal markup. A simpler option with no coupling is
  `expect(await screen.findByText(/^FleetConsole/)).toHaveTextContent('FleetConsole 1.0.0+dc5aff8 · Production')`
  (`getByText` only matches an element's own text nodes, so it hits the `<small>`). If you keep the function matcher,
  move it to `web/src/test/` and use it from both files.

**2026-11-18 frontend-architect, round 2: APPROVE**

Checks run by reviewer: `npm run lint && npm run typecheck && npm test -- --run && npm run build` all pass (7 files,
51 tests, one fewer than round 1 because the existing-v test was removed; the build still warns about the existing
chunk size). I did not repeat the browser check, as agreed. Dropping one character can only make the line shorter
than the round 1 screenshot, which already fit.

Required change 1 is resolved. `formatVersion.ts` no longer adds a prefix: `short` is `<core>[+<SHA cut to 7>]`, and
the existing-v branch and its test are gone. The TSDoc and the example in `FormattedVersion.short` are updated. All
expected strings are back to the original copy (`FleetConsole 0.0.0-test · Test`, `FleetConsole 9.9.9 · Slow`), and
the long-SHA case expects `1.0.0+dc5aff8`.

The optional nit was taken. Both test files use `findByText(/^FleetConsole ·/)` followed by `toHaveTextContent(...)`,
with no tag-name coupling and no duplicated helper. The ` ·` anchor is correct: `getByText` reads only the
`<small>`'s own text nodes, which the default normalizer collapses to `FleetConsole · <env>`, and that excludes the
masthead brand. The inline comment in `AppShell.test.tsx` explains this. The handover notes are up to date. No new
findings.

- **Done:** `web/src/app/layout/formatVersion.ts` (pure, unit-tested in `formatVersion.test.ts`) turns
  `1.0.0+<40-char sha>` into `1.0.0+dc5aff8`. It only shortens build metadata that is hex and longer than 7
  characters; other metadata (`+build.5`) and pre-release labels are kept; no `v` prefix (review round 1). `SystemInfoFooter` renders
  `FleetConsole 1.0.0+dc5aff8 · <env>`; when shortened, the label is a `tabIndex={0}` span inside a PF `Tooltip`
  (`Version <full>`), so the full value is available on hover and keyboard focus and is announced via
  `aria-describedby`. Unshortened versions get no tooltip and no tab stop. The `<small>` also has
  `pf-v6-u-text-break-word` so unusually long pre-release/environment values wrap instead of overflowing.
- **Tests:** the version is its own element, so footer tests use `findByText(/^FleetConsole ·/)` (own text nodes
  only; the `·` excludes the masthead logo) and then `toHaveTextContent('FleetConsole <version> · <env>')`.
- **Browser check:** the reviewer confirmed in headless Firefox at 1400x900 (round 1) that the footer fits; not re-run
  after dropping the prefix, which only shortens the text by one character.
- **Gotcha:** `jsx-a11y/no-noninteractive-tabindex` is disabled on that one line; a focusable trigger is the
  PatternFly-documented way to make a tooltip on static text keyboard-accessible.
