---
id: T-0055
title: Rebrand the user-facing product name to Consolinho (logo, favicon, masthead, login, footer, copy)
status: todo
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
- [ ] Browser tab title and favicon show Consolinho
- [ ] Masthead shows the Consolinho logo in light and dark theme; clicking it goes home
- [ ] Login page shows logo, "Log in to Consolinho", tagline and "Consolinho <version>" footer
- [ ] No rendered UI string contains "FleetConsole" (grep of non-comment string literals in `web/src` is empty)
- [ ] Existing sessions, stored tokens, theme and last-cluster preference survive the upgrade (Out-list untouched)
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
