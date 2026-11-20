---
id: T-0055
title: Rebrand the user-facing product name to Consolinho (logo, favicon, masthead, login, footer, copy)
status: done
owner: frontend-engineer
checkpoint: 2
depends_on: []
paths: [web/index.html, web/public/, web/src/app/layout/, web/src/features/, web/src/shared/, src/FleetConsole.Domain/Users/UserErrors.cs, src/FleetConsole.DevOAuth/Endpoints/AuthorizePage.cs, src/FleetConsole.Api/OpenApi/, README.md]
review_rounds: 0
---

## Goal
The product's official name is now **Consolinho** (decided by the human, 2026-11-20; repo: github.com/baddri/consolinho).
Everything a *user* sees says Consolinho and shows a Consolinho logo. The **source code identity stays FleetConsole**:
solution, project, namespace, assembly and folder names are unchanged.

## Scope
- In (user-visible only):
  - **Logo**: new `web/public/consolinho-logo.svg` (wordmark, light + dark variants or `currentColor`) and
    `web/public/favicon.svg`; `<link rel="icon">` + `<title>Consolinho</title>` in `web/index.html`.
  - **Masthead / header**: `AppMasthead.tsx` `MastheadLogo` → `<Brand>` with the SVG (alt "Consolinho"), still links home.
  - **Login page / banner**: `LoginPage.tsx` — `brandImgSrc`/`brandImgAlt`, `loginTitle` "Log in to Consolinho",
    `textContent` tagline "Consolinho — one console for your OpenShift fleet.", footer version line.
  - **Footer**: `SystemInfoFooter.tsx` "Consolinho <version> · <env>".
  - **UI copy**: every rendered string containing "FleetConsole" under `web/src/features` and `web/src/shared/api/errors.ts`
    (find with `grep -rn "FleetConsole" web/src --include=*.tsx --include=*.ts | grep -v '^\S*:\s*[0-9]*:\s*\(\*\|//\)'`).
  - **Backend strings a user can see**: `UserErrors.Deactivated` message, DevOAuth page title, OpenAPI document title
    (if set in `OpenApiSetup.cs`). Then `npm run gen:api` only if the OpenAPI output changed.
  - **Carried from T-0053:** "Administration user list/detail" endpoint XML docs (→ `schema.gen.ts`) and the
    `AuthErrors.Forbidden` message say "Fleet administration" where they mean the FleetConsole admin area.
  - **README.md** heading/intro: "Consolinho (codename FleetConsole)".
  - Tests asserting old strings updated (RTL text queries, backend message assertions).
- Out — **must not change** (breaks data, sessions or config):
  - `DataProtectionSetup.ApplicationName = "FleetConsole"` — changing it makes every stored SA token undecryptable.
  - `SessionDefaults.CookieName`, `localStorage` keys (`fleetconsole.theme`, `fleetconsole.lastCluster`).
  - Config group names (`fleetconsole-admins`), env/config keys, log message templates, metric/trace names.
  - Code comments / XML docs / TSDoc, namespaces, project names, `docs/` (may follow in a separate docs task).

## Contract / design notes
- Single source for the name in the SPA: add `web/src/shared/branding.ts` exporting `PRODUCT_NAME = 'Consolinho'`
  and the logo paths; components use it instead of literals (makes a future rename one line).
- Logo: simple, original wordmark (no Red Hat/OpenShift marks or colours imitating them); must read on PF6 light and
  dark masthead. SVG only, < 10 KB, no external fonts (outline the text).
- Assets in `web/public/` are served by the Api's SPA hosting as-is — check the built `dist/` contains them.

## Context pack
- Docs: `FRONTEND.md` § layout/masthead (grep `^#`)
- Touch points: `web/src/app/layout/AppMasthead.tsx:33`, `web/src/app/layout/SystemInfoFooter.tsx:40`,
  `web/src/features/auth/LoginPage.tsx:20-41`, `web/src/features/auth/loginMessage.tsx:15-37`,
  `web/src/shared/api/errors.ts:4-7`, `src/FleetConsole.Domain/Users/UserErrors.cs:57`,
  `src/FleetConsole.DevOAuth/Endpoints/AuthorizePage.cs:14`

## Acceptance criteria
- [x] Browser tab title and favicon show Consolinho
- [x] Masthead shows the Consolinho logo in light and dark theme; clicking it goes home
- [x] Login page shows logo, "Log in to Consolinho", tagline and "Consolinho <version>" footer
- [x] No rendered UI string contains "FleetConsole" (grep of non-comment string literals in `web/src` is empty)
- [x] Existing sessions, stored tokens, theme and last-cluster preference survive the upgrade (Out-list untouched)
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-20 frontend-engineer: `shared/branding.ts` (PRODUCT_NAME, theme-matched logo hook), stroke-drawn wordmark
  SVGs (light/dark) + favicon, masthead `<Brand>`, login brand/title/tagline/footer, all UI copy via PRODUCT_NAME.
  Backend: UserErrors.Deactivated, DevOAuth title, ConnectionTester cluster-admin hint, AuthErrors.Forbidden →
  "Fleet administration", user list/detail DTO docs; schema.gen.ts hand-edited (2 descriptions). README heading.
  check-fe + check-be green (one DevOAuthConfigurationTests failure on first BE run; passed alone and on rerun).

## Review
- 2026-11-20 frontend-architect: **APPROVE** (round 1). check-fe 504/504 green, check-be green (323/402/612). Out-list
  untouched (no diff in Api/Infrastructure; storage keys, cookie, DataProtection, group names unchanged); backend diff is
  message strings + XML docs only; logo original, theme-matched via `useLogoSrc`, covered by AppShell test; no stale
  "FleetConsole" in non-comment `web/src` literals; `dist/` has favicon + inlined logo. Declared deviations accepted.
- Nit (optional): `README.md:9` still says "the cluster FleetConsole runs on" — reads better as Consolinho.
- Nit (optional): new `@/shared/branding` imports sit after relative imports in ClustersListPage/ClusterForm/
  ClusterFormSections/DeleteCredentialModal/UsersListPage/grantText/credentials.ts — move up with the other `@/` imports.
- Follow-up note (CSP task): Vite inlines the logos as `data:image/svg+xml`; the planned SPA CSP (SECURITY.md:94) must
  allow `img-src 'self' data:` (PF6 CSS needs it too).

## Handover notes
- Logos live in `web/src/shared/assets/` (imported, not `public/`): `dev:mock` uses `msw/` as publicDir, so public
  logos would 404 there. Vite inlines them (<4 KB) as data URIs in `dist/`. `favicon.svg` is in `web/public/` (in dist;
  absent only in mock mode).
- Two logo files because an `<img>` SVG can't inherit `currentColor`; `useLogoSrc()` picks by `useTheme()`.
- `schema.gen.ts`: only the 2 "Fleet administration user list/detail" descriptions hand-edited; no `gen:api` run.
- OpenAPI document title is not set in `OpenApiSetup.cs` (default), so left untouched.
- Out of `paths` but user-visible, changed: `ConnectionTester` cluster-admin hint (+ test), mock mirror in
  `web/src/mocks/handlers/credentials.ts`; `AuthErrors.Forbidden` lives in Application (not Api), DTO docs too.
- Out-list untouched (DataProtection name/purpose, cookie, localStorage keys, config/group names, log templates).
- Follow-up: `OpenShiftLoginEvents` log template and other XML docs still say FleetConsole (intended, docs task).
