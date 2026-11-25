---
id: T-0372
title: Branding — two-part stacked wordmark (brand over product) and an abstract fleet mark
status: done
owner: frontend-engineer
checkpoint: 5.5
depends_on: []
paths: [web/src/shared/branding.ts, web/src/shared/assets, web/src/app/layout/AppMasthead.tsx, web/src/app/layout/AppMasthead.module.css, web/src/app/layout/AboutModal.tsx, web/src/features/auth/LoginPage.tsx, web/public/favicon.svg, web/src/app/layout/AppShell.test.tsx]
review_rounds: 0
---

## Goal
The human finds the brand weak. Today the masthead shows a 24px "stacked consoles" stroke glyph next to a single
h3-sized "Consolinho" (T-0360). OCP's masthead logo is a two-part lockup about 40px high: a brand line over a product
line (`openshift-logo.svg`, 119×40). We mirror that **structure** with our own name and an abstract mark. No Red Hat or
OpenShift artwork, fonts-as-logo or trademarks.

## Scope
- In:
  - New mark SVGs (light and dark).
  - The two-line wordmark in the masthead.
  - The same mark in About, Login and the favicon.
- Out:
  - Product rename.
  - Kubernetes-theme colour changes beyond keeping today's override working.

## Contract / design notes
- **Wordmark (designer's call, decided).** A two-line text lockup about 40px tall, left-aligned next to the mark:
  - Line 1, the brand: `PRODUCT_NAME` ("Consolinho"), `--pf-t--global--font--size--xs` (12px), weight `--pf-t--global--font--weight--body--bold` (700), heading font family, line-height 1.
  - Line 2, the product: new `PRODUCT_LINE = 'Fleet Console'` in `branding.ts`, `--pf-t--global--font--size--lg` (18px), regular weight (400), heading font, line-height 1.1.
  - Colours: `--pf-t--global--text--color--regular` for both lines. The Kubernetes override (`--fc-k8s--text`) applies to both lines.
  - Markup: a `<span className={styles.wordmark}>` with two child spans (`.brand`, `.product`), `display: inline-flex; flex-direction: column`. CSS module only, no inline styles.
- **Accessible name.** `MastheadLogo aria-label={`${PRODUCT_NAME} ${PRODUCT_LINE}`}`. This keeps label-in-name (WCAG 2.5.3) with the visible text. The wordmark stays `aria-hidden` and the image `alt=""`.
- **Mark (abstract "fleet").** Replace `consolinho-mark.svg` and `consolinho-mark-dark.svg`. `viewBox="0 0 24 24"`, rendered at 28px (`Brand heights default '28px'`).
  - Hub: filled circle `cx=12 cy=12 r=4`. This is the only accent: teal `#147878` (light) or `#63bdbd` (dark).
  - Satellites: three filled dots `r=2` at (12,3), (4.2,16.5) and (19.8,16.5).
  - A thin ring `r=9`, `stroke-width=1.5`, drawn as three arcs between the dots (gaps around each dot), so it does not read as a closed circle.
  - Monochrome `#151515` (light) / `#fff` (dark) for satellites and ring.
  - Keep the `MARK_SRC` / `useMarkSrc` API unchanged.
- **favicon.svg**: the same mark, keeping the existing `prefers-color-scheme` `<style>` technique (mark only, no text).
- **About / Login**: they already use `useMarkSrc()`, so they pick up the new mark. Login `textContent` and About `productName` stay `PRODUCT_NAME`. Only check sizing in the probe.
- `.logo` keeps a 40px block size. Gap between mark and wordmark: `--pf-t--global--spacer--sm`.

## Context pack
- Docs: `UX.md` § 2 Shell (masthead). Prior task: `docs/tasks/T-0360-fe-enterprise-wordmark.md` (what is being replaced, and why).
- Touch points:
  - `web/src/shared/branding.ts:PRODUCT_NAME`, `MARK_SRC`, `useMarkSrc`.
  - `web/src/app/layout/AppMasthead.tsx` L45–52 (`MastheadLogo`, `Brand`, wordmark span).
  - `AppMasthead.module.css` `.logo`, `.wordmark`, Kubernetes override.
  - `AboutModal.tsx` L32–39, `features/auth/LoginPage.tsx` L37–45, `web/public/favicon.svg`.
  - Tests: `AppShell.test.tsx:findBrandMark` (L45) and the light/dark `src` checks (L226, L239). Update any query that uses the accessible name "Consolinho".
- OCP reference (structure only):
  - `/home/bad/works/openshift-console/frontend/public/components/masthead/masthead.tsx` L78 (`co-masthead-logo`, a single lockup image inside `MastheadLogo`).
  - `public/imgs/openshift-logo.svg` (119.2×40 lockup: brand line over product line).

## Acceptance criteria
- [x] The masthead shows the new mark (28px) and the two-line "Consolinho / Fleet Console" lockup, about 40px tall, vertically centred. Probe numbers for light, dark and the Kubernetes theme are in the Work log.
- [x] The accessible name of the home link is "Consolinho Fleet Console". The mark image is decorative. Tests are updated.
- [x] Favicon, About and Login use the new mark in light and dark. No OpenShift or Red Hat artwork or wordmark is used.
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-25 frontend-engineer: in_progress → in_review. New fleet mark (hub + 3 satellites + broken ring) in both mark SVGs and favicon; `PRODUCT_LINE`; two-line `.brand`/`.product` lockup; aria-label "Consolinho Fleet Console"; tests updated.
- Probe (mock :5372, 1280w), identical in OCP light/dark and Kubernetes light/dark: masthead 73px; link 149×40 at y16; mark 28×28 at y22; wordmark 113×32 at y20 (brand 12px, product 18px/19.8px); all centred on y36. Colours: #151515 (OCP light), #fff (OCP dark, Kubernetes both); Kubernetes uses the dark mark.
- 2026-11-25 frontend-engineer: review round 1 fixes. `.brand` now uses `--font--weight--heading--bold`, and the favicon ring uses `stroke-width` 2. Login is unchanged (follow-up).

## Review
- 2026-11-25 ux-designer, round 1: **CHANGES_REQUESTED** (1 blocking, 2 non-blocking). Measured on the worktree mock at 1280 wide, OCP light/dark and Kubernetes. The reference console was down, so parity is judged from source (`public/components/masthead/masthead.tsx` L66-79, `public/style/_overrides.scss` L175-185, `public/imgs/openshift-logo.svg` 119.2×40).
  - OK: masthead 73px; logo box 149×40 at y16; mark 28px at y22; wordmark at y20-52. Everything is centred on y36, like OCP's 40px lockup image inside `MastheadLogo`. Gap 8px (`spacer--sm`). Colours are right in all three themes and Kubernetes uses the dark mark. The About brand is 37px, with the light and dark marks swapping correctly. The accessible name is "Consolinho Fleet Console".
  - [blocking] Masthead brand line: at 12px and weight 600, "Consolinho" reads thin and grey-ish next to the 18px product line. This is exactly the "weak brand text" the human complained about. OCP's brand line ("Red Hat" in `openshift-logo.svg`) is the heavy line of its lockup. Fix: `.brand` `font-weight: var(--pf-t--global--font--weight--heading--bold)` (800). Keep 12px and the product line at 400.
  - [non-blocking, follow-up] Login: the header brand is the bare mark at 24×24, the SVG's intrinsic size, with no name next to it. That is a weak brand surface and unchanged from T-0360. Suggestion: a follow-up task for a mark+wordmark lockup SVG (or a larger brand height) on Login.
  - [non-blocking] Favicon: the 32px version is clear. At 16px the 1.5 ring drops to about 1px and almost vanishes, so it reads as a hub with specks. Optional: in `favicon.svg` only, use `stroke-width="2"` on the ring.

## Handover notes
- Brand line uses the token `--pf-t--global--font--weight--body--bold`, which computes to **600** in PF6 (the spec text said 700). I kept the token, not a raw 700.
- The wordmark is 32px of text inside the 40px logo box. The box keeps OCP's 40px, so the masthead stays at 73px.
- Ring arcs leave gaps of about ±22° around each satellite (r=9, stroke 1.5, round caps). At 16px the hub is about 5px wide, the dots about 2.7px and the ring 1px; I judged this from the geometry, not a 16px render. The masthead render at 28px is clear. `xmllint` validates all three SVGs.
- About and Login pick up the mark through `useMarkSrc()`; their code is unchanged. `LoginPage.test` still passes (its img name is PRODUCT_NAME).
- Screenshot (scratchpad, not committed): ocp-light.png.
