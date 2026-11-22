---
id: T-0152
title: Keep the cluster switcher menu within the sidebar width while searching
status: done
owner: frontend-engineer
checkpoint: 3.7
depends_on: [T-0147]
paths: [web/src/features/cluster-context/]
review_rounds: 1
---

## Goal
Found in the T-0145 UX review. When search text is typed, the switcher menu grows to 299px, wider than the 256px
toggle, and spills past the sidebar edge. OCP's perspective/cluster menu keeps the toggle width. Pin the menu width to
the toggle width (PF `Menu`/`Select` width prop or `popperProps`) and let long names truncate with a tooltip.

## Scope
- In: switcher menu width while searching and with long cluster names; a unit test where it can be asserted.
- Out: switcher content (T-0147).

## Acceptance criteria
- [x] With search text and with a 60-character display name, the menu is no wider than the toggle (probe measurement).
- [x] Long names truncate; the full name is shown in a tooltip and the accessible name.
- [x] `scripts/check-fe.sh` passes (done); the ux-designer approves (Round 1 APPROVE).

## Work log
- 2026-11-23 frontend-engineer: `popperProps={{ width: 'trigger' }}` (was minWidth trigger / maxWidth 28rem), like OCP's
  perspective `Select` whose menu stays at toggle width. Unit test for 60-char name: Truncate, option name, tooltip.
  Measured with a temporary 60-char lab-1 name on `dev:mock` :5277 (fixture restored, server stopped). check-fe green.

## Handover notes
- Fix is one prop in `ClusterSwitcher.tsx` (`MenuContainer` popperProps `width: 'trigger'`); content/theme untouched.
- Measurements (1280 wide, sidebar 322px): toggle 256px, menu 256px in every case: open, search "lab cluster with a
  deliberately", search "zzz no such cluster at all", and with a 60-char display name (truncated to 85-107px
  before the labels). No visible child goes past the menu edge.
- The only element wider than the menu is the visually hidden `NoMatchStatus` live region (`pf-v6-screen-reader`,
  fixed + clip-path), so `scrollWidth` reads 269-358px while nothing is visible there. This is harmless.
- `ui-probe.mjs` never clicks, so it can't open the menu. I measured with a throwaway scratchpad script instead.
- Test: `clusterContext.test.tsx` "truncates a long display name..." (+1 test, 891 total). jsdom has no layout, so the
  width itself is not unit-tested.

## Review
### Round 1 — ux-designer — APPROVE (2026-11-23)
- Measured on `dev:mock` :5288, 1280 wide, lab-1 temporarily renamed to 61 chars (restored): toggle 256px, menu 256px (x=33) when open, with search "lab cluster with a deliberately" and with no-match search; no visible child goes past the menu's right edge (sr-only live region excluded). Dark mode: open menu also 256px.
- Truncation: the menu option and toggle show "Lab cluster ..." with the K8s/dev labels kept. Hovering shows a tooltip with the full name, and the option's accessible name is the full name. Light and dark checked visually.
- OCP parity: `packages/console-app/src/components/nav/NavHeader.tsx` perspective `Select` (full-width `MenuToggle`, PF Popper default `minWidth: 'trigger'`, appended inside the toggle) keeps the menu at the toggle's width. `width: 'trigger'` matches that and also bounds long names, which is fine for a fleet feature.

## Review
### Round 1 — frontend-architect, 2026-11-23: APPROVE
- `ClusterSwitcher.tsx:407` `popperProps={{ width: 'trigger' }}` is the idiomatic PF 6 Popper prop (typed in `Popper.d.ts`), matches OCP's perspective menu; comments and TSDoc updated to "exactly as wide".
- `clusterContext.test.tsx:297` covers Truncate, full accessible name and tooltip; width itself is layout-only (jsdom), measured by probe per Handover — acceptable.
- Gate: first full `check-fe.sh` run had 5 failures, all asserting the `Lab 1` fixture name (likely the engineer's temporary fixture edit being reverted mid-run); isolated rerun and second full run green (891/891). No action needed.
- Nit (optional): none. Remaining AC: ux-designer approval.
