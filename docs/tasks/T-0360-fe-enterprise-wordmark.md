---
id: T-0360
title: Replace the Consolinho wordmark with a smaller, enterprise-style logo
status: done
owner: frontend-engineer
checkpoint: 5
depends_on: []
paths: [web/src/shared/assets, web/src/shared/branding.ts, web/src/app/layout/AppMasthead.tsx, web/src/app/layout/AppMasthead.module.css, web/src/app/layout/AboutModal.tsx, web/src/features/auth/LoginPage.tsx, web/public/favicon.svg, web/src/app/layout/AppShell.test.tsx]
review_rounds: 0
---

## Goal
Human feedback (2026-11-25, screenshot of the dark masthead): the logo is too large, not enterprise enough, and the
font looks odd. The current SVG (`shared/assets/consolinho-logo*.svg`) is a 32px teal tile plus a hand-drawn
rounded-stroke wordmark, rendered by `<Brand heights 40px>`. Make it read like an OCP-class enterprise product.

## Scope
- Lettering: OCP's masthead wordmark is set in Red Hat Display, which PatternFly ships as
  `--pf-t--global--font--family--heading`. Replace the hand-drawn stroke lettering with real type in that family:
  - "Consolinho" in medium weight (500), at about 18–20px, with neutral letter-spacing.
  - Colour: `--pf-t--global--text--color--regular` for the theme, and the dark-surface value on the navy Kubernetes
    masthead.
  - Prefer rendering the text as HTML next to the mark, not as SVG `<text>`. An `<img>` SVG can't use the app's web fonts.
- Mark: a small, restrained one of about 24px.
  - Monochrome or one muted accent. No saturated tile, no cartoonish rounding (radius ≤ 4px).
  - A simple geometric console/fleet glyph.
  - No Red Hat or OpenShift logos, hat, or trademarks.
- Size: it must be visibly smaller than today's. The overall height should be at about OCP's wordmark height
  (measure OCP's `.co-masthead-logo` in /home/bad/works/openshift-console/frontend), and the masthead height must stay
  OCP-equal. Adjust `AppMasthead.module.css` if the 60px max-height override is no longer needed (keep its comment true).
- Use the same brand in the About modal, the Login page and the favicon (the mark only). `PRODUCT_NAME` stays the
  single source of the name, and the light/dark handling stays correct, including the Kubernetes navy masthead.
- Keep the accessible name "Consolinho" on the home link. Update the tests.

## Acceptance criteria
- [x] The masthead brand is smaller than before and the masthead height is unchanged vs OCP (probe numbers in the Work log).
- [x] Wordmark text is rendered in Red Hat Display (probe the computed font-family), 500 weight.
- [x] Correct in light, dark and the Kubernetes navy masthead. About modal, Login and favicon updated.
- [x] `scripts/check-fe.sh src/app src/features/auth src/shared` passes.

## Work log
- 2026-11-25 frontend-engineer: in_progress. 24px "stacked consoles" mark (mono + muted teal, rx 2) + HTML "Consolinho" in Red Hat Display 500/18px.
- Probe: brand 249x40 -> 124x40 (OCP 119x40); masthead 73px = OCP (70px until logo box kept 40px min). Font-family "Red Hat Display", 500;
  colour #151515 light, #fff dark, #fff on navy (#003366, 73px). Login/About show the 24px mark; favicon follows OS scheme.
- Shots (brand only): /tmp/claude-1000/-home-bad-works-console/7c6219a0-70b8-466a-856b-d3cbf2309755/scratchpad/t0360/os/ours-0-light.png, ours-0-dark.png (OCP: ocp-0-*.png), /tmp/claude-1000/-home-bad-works-console/7c6219a0-70b8-466a-856b-d3cbf2309755/scratchpad/t0360/k8s/ours-0-light.png.
- `scripts/check-fe.sh src/app src/features/auth src/shared` green (489 tests).

## Review

## Handover notes
- `branding.ts`: `LOGO_SRC`/`useLogoSrc` -> `MARK_SRC`/`useMarkSrc` (mark only); old `consolinho-logo*.svg` deleted.
- Masthead link: `aria-label={PRODUCT_NAME}`, mark `alt=""`, name as `aria-hidden` span (OCP pattern). Tests use `findBrandMark()`.
- Weight 500 is a literal: PF6 has no 500 weight token (heading default is 600).
- Follow-up (outside paths): docs/architecture/UX.md:94 still says `LOGO_SRC.dark`; should read `MARK_SRC.dark`.
- Login page brand is the 24px mark; its title "Log in to Consolinho" carries the name.
