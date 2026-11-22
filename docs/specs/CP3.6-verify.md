# CP3.6 verify — OCP parity (qa-engineer, 2026-11-22, branch `cp/3.6-ocp-parity`)

**Verdict: PASS WITH FOLLOW-UPS.** No functional bug found. Exit criterion still open: 4 matrix rows are `gap` with no
recorded human waiver (needs fix or waiver: T-0132 for CP3.6, T-0133 to CP4).

## Gates
- `scripts/check-fe.sh`: lint, typecheck, build ok; Vitest 72 files / 804 tests pass.
- `scripts/check-be.sh`: build ok; 325 + 684 + 769 = 1778 tests pass.
- e2e (Aspire `http` profile, `npm run e2e`): 9/9 pass (auth H1-H2, browse QG-4, csp HOST-3, layout L1-L2, switcher H3-H4).
  No selector changes were needed (collapsed nav, User preferences, events stream did not break any existing spec).

## AC spot-check (mock UI, 1280 light unless noted; `?mockUser=admin|alice`)
| Task | Checked | Result |
|---|---|---|
| T-0119 shell | masthead (Help, user menu, no theme button), floating sidebar, switcher; alice on ungranted/disabled/unknown cluster → "Cluster X is not available", no cluster nav, "Select a cluster" focuses switcher search | pass |
| T-0120 prefs/favs | Color scheme Dark applies instantly, survives reload (`pf-v6-theme-dark`); star → name modal → Favorites entry, persists reload, unstar | pass (focus nit T-0134) |
| T-0121 lists | pods/deployments/configmaps/projects: toolbar, `/` focuses filter, badges, status icons, sticky kebab, compact pagination; table fits (894 = container) | pass |
| T-0122 details | pod DescriptionList order (Name…Created at, Owner / Status…Node), tabs; deployment ring + sections (dark) | pass |
| T-0123 YAML | toolbar, managedFields folded, Cancel → Details, Download `pod-<name>.yaml`; alice read-only: no Save, editor readonly | pass |
| T-0124 events | stream, pause → "Event stream is paused.", play resumes, text filter 4 → 1 | pass |
| T-0125 forms/404 | `/admin/clusters/new` sticky footer (dark); 404 h1 + title "Page Not Found (404)"; delete Deployment modal has dependents checkbox | pass |
| T-0126 admin | users/clusters/credentials/audit lists render, no overflow; cluster/user details lg badge headings | pass |
| T-0127 mock assets | `/theme-init.js`, `/favicon.svg`, `/mockServiceWorker.js` → 200 | pass |
| T-0129 time/owner | Created = clock + absolute; pod Owner RS badge link; "3 of 3 pods" → `/deployments/web/pods` | pass |
| T-0131 RS/services | all-namespaces lists fit at 1280 (Owner/Type hidden < 2xl) | pass |

## Edge probes
- Read-only (alice, prod-eu-1): Delete disabled in Actions and row kebab; YAML has no Save. Pass.
- 375 / 768: no page-level horizontal overflow on 9 pages; YAML toolbar hidden < 768 (mirrors OCP `CodeEditor.scss`).
  Cosmetic: at 375 event-card timestamp crowds the involved-object name (truncated, readable).
- Dark mode: pods, events, deployment, form, 404 render correctly.
- Keyboard: logical tab order on list/events/prefs; visible focus rings on new controls; Escape returns focus to star.

## Parity matrix
All rows `match` except named gaps: ReplicaSets labels wrap, Services columns (T-0132, CP3.6); Details field help popovers,
Deployment ring scale buttons (T-0133, CP4). Waived/accepted items in other rows are named in the row.

## Bugs / follow-ups filed
- T-0132 Services columns + labels wrap (checkpoint 3.6, or human waiver).
- T-0133 field help popovers + ring scale buttons (checkpoint 4; human waiver needed for CP3.6 exit).
- T-0134 favourite modal should autofocus Name like OCP (checkpoint 6, minor).
