---
id: T-0138
title: UI parity probe script (screenshots + computed-style diff vs OCP)
status: todo
owner: frontend-engineer
checkpoint: 3.6
depends_on: []
paths: [scripts/ui-probe.mjs, scripts/ocp-ref/shot.mjs, docs/dev/OCP-REFERENCE.md, docs/architecture/UX.md]
review_rounds: 0
---

## Goal
Engineers and the ux-designer each hand-write Playwright scripts (`probe.mjs`, `cols.mjs`, `menus.mjs`, ...), start
and kill `vite --mode mock` on random ports (~8 starts per engineer run in CP3.6), and eyeball full-page screenshots.
Most review findings were measurable numbers (e.g. "badge gap 15px, OCP 7px", font weight 400 vs 600). One script that
reuses one dev server and prints a **text** diff of computed styles lets engineers catch these before review and lets
reviewers measure instead of reading images (T-0137).

## Scope
- In: `scripts/ui-probe.mjs` (Node ESM, resolves `@playwright/test` from `web/` like `scripts/ocp-ref/shot.mjs`); a
  short usage section in `docs/dev/OCP-REFERENCE.md` and one line in `UX.md` §0 pointing to it.
- Out: CI integration, visual pixel diffing, changes to app code, committing screenshots.

## Contract / design notes
```
node scripts/ui-probe.mjs <ours-route> <ocp-route> [--pair '<ourSel>=<ocpSel>' ...] [--props a,b,...]
                          [--width 1280] [--theme light|dark|both] [--shot <outDir>] [--user admin|alice]
```
- **Server reuse:** ours = mock UI at a fixed port `5199` (`cd web && npx vite --mode mock --port 5199 --strictPort
  --host 127.0.0.1`). If the port answers, reuse it; otherwise start it detached (log in `$TMPDIR`), wait until ready,
  and **leave it running** for the next call. `--stop` kills only that server. Never kill other processes.
  OCP = `http://127.0.0.1:9000` (`scripts/ocp-ref/run-console.sh`); if it's down, print one line telling the caller
  to ask the orchestrator to start it, and still probe our side.
- `--user` maps to `?mockUser=`. Wait strategy as in `shot.mjs` (load + first `h1` + settle; OCP never reaches networkidle).
- **Style diff (default output, text only):** for each `--pair`, take the first matching element on each side and
  print one line per differing property: `<ourSel> | <prop>: ours=<v> ocp=<v>`, plus box size and the gap to the
  previous sibling. Default props: font-family, font-size, font-weight, line-height, color, background-color,
  padding, margin, gap, border, border-radius, width, height. Matching properties print nothing. End with
  `N mismatches / M checked`. Missing selector → `<sel>: not found (ours|ocp)`.
- `--shot <dir>`: also write screenshots **clipped to each pair's elements** (`ours-<i>-<theme>.png`,
  `ocp-<i>-<theme>.png`); without pairs, a 1280×800 viewport shot. Default theme: light.
- Exit 0 always (it's a measuring tool); exit 2 on bad usage. Header comment explains why it exists and the
  no-clicking rule for the reference console (it runs with the user's token).

## Context pack
- Exemplar: `scripts/ocp-ref/shot.mjs` (require via `createRequire`, wait strategy, colorScheme per page).
- Touch points: `web/package.json` `dev:mock`; `web/vite.config.ts` (mock mode); `docs/dev/OCP-REFERENCE.md` §Run and screenshot.
- Rules: CLAUDE.md "Screenshots"/"Turns" bullets; reference console = browse only, never click actions.

## Acceptance criteria
- [ ] Two consecutive runs reuse the same server (second run starts no process); `--stop` stops it.
- [ ] Against a running reference console, `--pair 'h1=h1'` on a details page prints mismatch lines or `0 mismatches`.
- [ ] With the reference console down, it prints the one-line hint and still probes our side.
- [ ] `--shot` writes clipped PNGs only into the given dir.
- [ ] Usage documented in `OCP-REFERENCE.md`; `UX.md` §0 points to it.
- [ ] `scripts/check-fe.sh` green (script isn't part of the web build, but nothing else may break).

## Work log

## Review

## Handover notes
