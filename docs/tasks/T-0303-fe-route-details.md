---
id: T-0303
title: Route details — Details, TLS settings, Traffic, Router ingress status (RT-3, RT-4)
status: done
owner: frontend-engineer
checkpoint: 5a
depends_on: [T-0302]
paths: [web/src/features/resources/registry/kinds/routes.tsx, web/src/features/resources/networking/routes]
review_rounds: 1
---

## Goal
The Route details page answers "where is it served, how is TLS terminated, which router admitted it and why not" —
OCP's `RouteDetailsTab` sections — without ever rendering certificate or key material.

## Scope
- In: `DetailsSection` (right column), `ExtraSections` (TLS settings, Traffic when `alternateBackends`, Router
  ingress status or the no-status alert); tabs Details · YAML · Events (generic); common actions only (RT-4).
- Out: Metrics tab (Prometheus, Q6 → parity gap); Route form (Edit Route → YAML, generic `edit` action).

## Contract / design notes
- Follow *(np)* `RouteDetailsTab.tsx` order exactly: `RouteDetailsSection` (our left metadata + right column),
  `TLSSettingsSection`, `TrafficSection` (only with `alternateBackends`), `IngressStatusSection` or `NoRouteStatus`.
  Copy, field labels and row order come from those files (read each; they are small).
- **Right column** (`networking/routes/RouteDetails.tsx:RouteDetails`, `DetailsItem`s): Location (`RouteLocation` from
  T-0302), Status (`routeStatus` + icon), Host, Path, Service (`ResourceLink` + weight when set), Target port, and
  "Router canonical hostname" per admitted ingress — labels/`path`s as OCP.
- **TLS settings** (`DetailsSubsection`, *(np)* `TLSSettingsSection`): Termination type, Insecure traffic, and for
  each of Certificate / Key / CA certificate / Destination CA certificate **only** "Set" vs `DASH`-style "Not set"
  (SAFE5-4: never the PEM, not even truncated; OCP shows the PEM — this is an accepted fleet deviation, record it in
  the Work log for the parity row). No TLS → OCP's "TLS is not enabled." copy (verify wording in source).
- **Traffic** (*(np)* `TrafficSection`): compact PF `Table` Service · Weight · Percent (weights → percentages as OCP).
- **Router: Ingress status** (*(np)* `RouteIngressStatusSection`): per `status.ingress[]` a block with Host, Router name,
  Wildcard policy, Router canonical hostname and a compact Conditions table (Type, Status, Updated, Reason, Message —
  reuse the shared Conditions table if `workloads` has one: grep `Conditions` in `workloads/` and `shared/ui`).
  Empty `status.ingress` → *(np)* `NoRouteStatus` alert.
- Tests in `networking/routes/routeDetails.test.tsx`: sections per fixture (`web` TLS edge, `web-canary` traffic,
  `pending` no-status alert, `rejected` condition message); **SAFE5-4**: rendered DOM never contains `FAKE-CERT` /
  `FAKE-KEY` from the `web` fixture.

## Context pack
- Docs: UX.md §6 (details layout); spec §5 UX notes (compact tables under `SectionHeading`).
- Exemplars: `registry/kinds/services.tsx:PortsTable`, `ServicePorts` (compact table in `DetailsSubsection`);
  `registry/kinds/jobs.tsx` (`DetailsSection` + `ExtraSections` wiring).
- Touch points: `registry/kinds/routes.tsx:routeDescriptor`; `networking/routes/{routeStatus.ts,RouteLocation.tsx}` (T-0302).
- OCP reference: *(np)* `src/views/routes/details/RouteDetailsPage.tsx`, `components/tabs/detailsTab/RouteDetailsTab.tsx`
  and `components/tabs/detailsTab/components/{RouteDetailsSection,TLSSettingsSection,TrafficSection,RouteIngressStatusSection,NoRouteStatus.tsx}`
  (`gh api repos/openshift/networking-console-plugin/contents/<path>`).

## Acceptance criteria
- [x] RT-3: `web` details show Location link, Accepted, host, Service link, target port, canonical hostname; TLS settings Termination `edge`, Insecure traffic `Redirect`, Certificate/Key "Set"; Router ingress status with conditions.
- [x] SAFE5-4: no certificate/key text in the DOM (test).
- [x] RT-4: Actions = Edit labels · Edit annotations · Edit Route · Delete Route; tabs Details · YAML · Events.
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-25 frontend-engineer: `networking/routes/RouteDetails.tsx` (summary Extra, right column, `RouteSections`) + `routeTraffic.ts` helpers, wired into `routeDescriptor`; 7 tests in `routeDetails.test.tsx`.
- Parity deviations (for the parity row): TLS Certificate/Key/CA/Dest CA show only "Set"/"-" (SAFE5-4; OCP shows PEM + copy + Reveal key); one bordered section per router (OCP stacks routers 40px apart in one section); Metrics tab omitted.
- Followed OCP source over the task text: Service + Target port sit in the metadata column (OCP left column), no weight there (it's in Traffic); canonical hostname only for the `spec.host` ingress; `NoRouteStatus` is OCP's EmptyBox text "No route status", not an alert; title "TLS Settings".

## Review
- 2026-11-25 frontend-architect, round 1: **APPROVE**. `check-fe.sh src/features/resources/networking` green (39 tests).
  - SAFE5-4: `pemPresence` renders only "Set"/"-"; the test asserts no FAKE-CERT/FAKE-KEY in textContent and innerHTML. The YAML tab (generic editor) **does** show `spec.tls.key`/certificates in full, as OCP does and as Secret YAML does; spec SAFE5-4 says "details pages", so record it for the PO/parity row (T-0311). Not blocking.
  - hrefs: the only external href is `RouteLocation` → `routeWebUrl` (T-0302's `hostUrl` path); RouteDetails adds only internal `ResourceLink`s.
  - Deviations from the task text verified against networking-console-plugin source: Service/Target port in `DetailsSectionLeftColumn` (no weight); canonical hostname from `getIngressStatusForHost` only; `NoRouteStatus` is a status box with "No route status", not an alert (our sm `EmptyState` is the right equivalent); title "TLS Settings"; "TLS is not enabled." matches.
  - Per-router bordered `DetailsSubsection` (OCP: one PageSection, `co-m-route-ingress-status` blocks) is acceptable: gives each router a labelled region. List it in the parity row.
  - Nit (optional): the parity row should say "Set / -" (spec line 165 says "Set/Not set"; `-` follows OCP's absent value). `routeTraffic.ts:26` uses a literal `'-'`; `DASH` would be consistent.
- 2026-11-25 ux-designer, round 1: **CHANGES_REQUESTED** (1 finding). Ref: networking-console-plugin `src/views/routes/details/components/tabs/detailsTab/**` (via gh api); probe ours-only on web, web-canary, pending, rejected @1280 light.
  - Route web, "Do you need to set up custom DNS?" — ours is `isInline` (dotted PF inline-link underline, 0 padding, 246x21). OCP `CustomRouteHelp.tsx` uses a non-inline `ButtonVariant.link` + `pf-m-link--align-left`, and in PF6 that override (`public/style/_overrides.scss:132`, `--pf-v6-c-button--PaddingLeft`) does nothing, so OCP shows no underline and the default link padding. Fix: drop `isInline` from `CustomRouteHelp` (`RouteDetails.tsx` L53; it covers both the right column and the router sections).
  - Match: section h2s are 20px/600 with 16px margin-bottom (`DetailsSectionTitle` Title h2 `pf-v6-u-mb-md`). "Conditions" h3 is 18px with 24px margins (`pf-v6-u-my-lg`). Traffic explanation is subtle with 24px margin-bottom (`_common.scss:63`). The Traffic table is compact with row borders, 80.0%/20.0% (`TrafficSettings.tsx`). Right-column order and labels, "TLS Settings" field order, "TLS is not enabled." and the HostAlreadyClaimed message (break-word) all match too.
  - Accepted deviation: each router gets its own bordered `DetailsSubsection`, where OCP uses one `PageSection` with `.co-m-route-ingress-status + …` 40px apart (`_route.scss:6`). With one router (the usual case) it looks the same. With sharded routers you see a divider and a 33px gap instead of 40px, and each router becomes its own labelled region. T-0311 records it.
  - Accepted deviation: "No route status". OCP renders a bare `div.cos-status-box` that has no CSS rule left in console main, so it shows as plain centred 14px text. Ours is the sm `EmptyState` from OCP `ConsoleEmptyState` (16px subtle, `pt-xl-on-md`), as OCP's own EmptyBox does. T-0311 records it.
  - Accepted deviation: TLS PEM fields show "Set"/"-" with no Reveal or copy (SAFE5-4). The plugin's `PageSection`s have no dividers between them, while ours add `co-m-pane__body` dividers like OCP core details pages. Shared `ConditionsTable` shows Updated from lg up, OCP route shows it from md up. That makes no difference at 1280 and isn't changed here.

## Handover notes
- Details: `RouteSummaryExtra` (metadata column, between Annotations and Created at), `RouteDetails` (right column),
  `RouteSections` (TLS Settings, Traffic when `alternateBackends`, `Router: <name>` per ingress or "No route status").
- PEM fields never reach the DOM: `pemPresence` renders "Set"/"-"; test asserts no FAKE-CERT/FAKE-KEY in body HTML.
- "Do you need to set up custom DNS?" popover (OCP `CustomRouteHelp`) shows for admitted routes without
  `openshift.io/host.generated: "true"` — every fixture route qualifies.
- Router conditions reuse `components/ConditionsTable` (Updated column ≥ lg vs OCP route's ≥ md; not changed here).
- ui-probe run ours-only (no networking plugin on :9000): explanation text subtle + 24px bottom margin, sections reuse
  `DetailsSubsection` spacing.
- Round 2 (orchestrator): removed `isInline` from the custom DNS button (UX finding); networking checks green. APPROVED.
