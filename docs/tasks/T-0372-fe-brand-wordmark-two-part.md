---
id: T-0372
title: Branding — two-part stacked wordmark (brand over product) and an abstract fleet mark
status: todo
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
- [ ] The masthead shows the new mark (28px) and the two-line "Consolinho / Fleet Console" lockup, about 40px tall, vertically centred. Probe numbers for light, dark and the Kubernetes theme are in the Work log.
- [ ] The accessible name of the home link is "Consolinho Fleet Console". The mark image is decorative. Tests are updated.
- [ ] Favicon, About and Login use the new mark in light and dark. No OpenShift or Red Hat artwork or wordmark is used.
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
