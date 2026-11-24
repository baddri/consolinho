---
id: T-0303
title: Route details — Details, TLS settings, Traffic, Router ingress status (RT-3, RT-4)
status: todo
owner: frontend-engineer
checkpoint: 5a
depends_on: [T-0302]
paths: [web/src/features/resources/registry/kinds/routes.tsx, web/src/features/resources/networking/routes]
review_rounds: 0
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
- [ ] RT-3: `web` details show Location link, Accepted, host, Service link, target port, canonical hostname; TLS settings Termination `edge`, Insecure traffic `Redirect`, Certificate/Key "Set"; Router ingress status with conditions.
- [ ] SAFE5-4: no certificate/key text in the DOM (test).
- [ ] RT-4: Actions = Edit labels · Edit annotations · Edit Route · Delete Route; tabs Details · YAML · Events.
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
