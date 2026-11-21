# CP3.5 "OCP look & feel" — acceptance (QA, 2026-11-22)

Frontend only; backend unchanged. ACs live in T-0110…T-0116 and `docs/architecture/UX.md`.

## Checks run
- `scripts/check-fe.sh`: lint, typecheck, 64 files / 729 tests, build: all green.
- e2e on the Aspire stack (`npm run e2e`): the 7 existing specs passed unchanged (T-0111 had already updated the selectors).
  Added `web/e2e/layout.e2e.ts` (L1: no switcher in the masthead; sidebar switcher works by keyboard: Enter opens with
  search focused, Escape puts focus back on the toggle, typing + Enter keeps the path. L2: theme menu by keyboard, Dark
  survives reload, System follows an OS colour-scheme change without reload). Suite total: **9/9 passed**.
- Mock UI (`dev:mock`, port 5302), scripted at 1280×900 and 1920×1080, light + dark: 21 routes measured (one h1, no page
  or table horizontal overflow, no truncated `th`, forbidden copy) plus screenshots; live checks of the grant modal
  (1 close button, Escape closes) and a keyboard switch prod-eu-1 → staging-eu-1 that kept `/k8s/ns/shop/pods`.

## Per-task verdict
- T-0110 shared blocks: **met**. Note: the tab bar and its active underline line up with the h1 (x=314), but the tab *text* is 16 px further in because of PF tab padding (OCP horizontal-nav looks the same). The AC literally says "text", so ux-designer should confirm. Not blocking.
- T-0111 sidebar switcher/masthead/theme: **met** (e2e H3, H4, L1, L2 + mock: Recent/All groups, menu not clipped, bob's toggle disabled).
- T-0112 resource lists: **met** (Pods/Deployments/Projects/ConfigMaps: project bar, h1 with no Live label, nothing truncated, icon+text status).
- T-0113 resource details: **met** (Deployment/Pod: breadcrumb, outlined status, two columns, CrashLoopBackOff red icon, empty Events, YAML fills the card).
- T-0114 admin lists: **met** (no overflow or truncated header at 1280, create actions in the heading, alert has a gap above the toolbar).
- T-0115 admin details/forms: **met** (forbidden copy absent on admin/alice/ines, group-source copy right, one "Grant access" entry point, form 880 px = 55rem).
- T-0116 modals/wizard: **met** (one close control + Escape live; wizard by `BulkGrantWizard.test.tsx:129`; 404 h1 top-left + empty state).

## Bugs filed
None. Follow-up: T-0117 marks the spec lines these tasks supersede (docs only, product owner).
