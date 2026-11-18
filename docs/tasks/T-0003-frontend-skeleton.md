---
id: T-0003
title: Frontend skeleton — Vite, React, TS, PatternFly 6 shell, tooling
status: todo
owner: frontend-engineer
checkpoint: 0
depends_on: []
paths: [web/]
review_rounds: 0
---

## Goal
Create `web/` following `docs/architecture/FRONTEND.md` with tooling that enforces the rules from day one.

## Scope
- Vite + React + TypeScript (strict, `noUncheckedIndexedAccess`), PatternFly 6 (`@patternfly/react-core`,
  `react-icons`, `react-table`, `patternfly` css), React Router (data router), TanStack Query (+ devtools in dev).
  Use the React major PatternFly 6 officially supports (check peer deps); pin exact versions.
- Folder structure from FRONTEND.md (`app/`, `shared/`, `features/`, `test/`), path alias `@/` → `src/`.
- App shell (`app/layout`): PatternFly `Page` with `Masthead` (brand "FleetConsole", placeholder **ClusterSwitcher**
  `Select`/`MenuToggle` showing hard-coded clusters with env label colour, user dropdown placeholder, theme toggle light/dark),
  `PageSidebar` nav with OCP-like groups: Home (Overview, Search, Events), Workloads (Pods, Deployments, StatefulSets,
  DaemonSets, Jobs, CronJobs, ConfigMaps, Secrets), Networking (Services, Routes, Ingresses, NetworkPolicies),
  Storage (PVCs, PVs, StorageClasses), Compute (Nodes), Administration (Namespaces/Projects); separate "Admin" section
  for `/admin/users|clusters|credentials|audit`.
- Routes: `/` → redirect to `/c/:firstCluster/overview`; `/c/:cluster/overview`, `/c/:cluster/ns/:namespace/:resource`,
  `/c/:cluster/ns/:namespace/:resource/:name`, `/c/:cluster/cluster/:resource[/:name]`, `/admin/*`, `/login`, 404 — all
  placeholder pages rendering the route params. `useActiveCluster()` hook reads `:cluster` from the URL.
- `shared/api`: `openapi-fetch` client with base `/api`, adds `X-Console-Request: 1` on non-GET; `npm run gen:api`
  runs `openapi-typescript` against `${API_URL:-http://localhost:5000}/openapi/v1.json` → `src/shared/api/schema.gen.ts`
  (commit a minimal placeholder schema so build works before backend exists). A `useSystemInfo()` query hook calling
  `GET /api/system/info` (`{ version: string, environment: string }`) shown in the masthead "About" or footer.
- Tooling: ESLint flat config (typescript-eslint strict, react-hooks, jsx-a11y, `@typescript-eslint/no-explicit-any`
  error, feature boundary rule via `eslint-plugin-boundaries` or `import/no-restricted-paths`), Prettier,
  Vitest + jsdom + RTL + `@testing-library/user-event` + MSW (node) with `src/test/setup.ts`, render helper with providers.
- Scripts: `dev`, `build`, `preview`, `lint`, `typecheck`, `test`, `gen:api`, `format`.
- Vite dev server proxies `/api` to `process.env.services__api__https__0 || services__api__http__0 || http://localhost:5000`
  (Aspire injects these env vars) — document in vite.config.ts.
- Tests: shell renders nav + switcher; route params page; `useSystemInfo` with MSW.

## Acceptance criteria
- [ ] Spec CP0 criterion 8 satisfied
- [ ] `npm run lint && npm run typecheck && npm test -- --run && npm run build` pass
- [ ] No `any`, no DOM selectors; TSDoc on components/hooks

## Work log

## Review

## Handover notes
