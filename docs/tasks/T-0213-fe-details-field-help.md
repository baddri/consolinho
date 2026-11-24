---
id: T-0213
title: Details field-help popovers from the cluster schema (OCP DetailsItem `path`)
status: done
owner: frontend-engineer
checkpoint: CP4c
depends_on: [T-0210, T-0214]
paths: [web/src/shared/ui/page/DetailsGrid.tsx, web/src/shared/ui/page/FieldHelpContext.tsx, web/src/shared/ui/index.ts, web/src/shared/ui/details.test.tsx, web/src/features/resources/details/ResourceDetailsTab.tsx, web/src/features/resources/details/MetadataSection.tsx, web/src/features/resources/details/sections/, web/src/features/resources/registry/kinds/, web/src/features/resources/workloads/config/SecretDetails.tsx, web/src/features/resources/workloads/config/DataSection.tsx, web/src/features/resources/workloads/cronjobs/cronJobDetails.tsx, web/src/features/resources/workloads/jobs/jobDetails.tsx, web/src/features/resources/workloads/replicationcontrollers/replicationControllerDetails.tsx, web/src/features/resources/workloads/deploymentconfigs/deploymentConfigDetails.tsx, web/src/features/resources/workloads/daemonsets/daemonSetDetails.tsx, docs/architecture/ocp-parity.md, docs/tasks/T-0133-*.md]
review_rounds: 0
---

## Goal
Details terms that have a schema description render OCP's dashed-underline term with a popover (HELP-1). This closes parity waiver W3 and the remaining part of T-0133.

## Scope
- In:
  - The `path` prop on the shared `DetailsItem`.
  - `FieldHelpContext` + provider in `ResourceDetailsTab`.
  - `path` props on every resource details call site, with the same paths OCP uses (MetadataSection included).
  - Parity row 38 and waiver W3; T-0133 is closed as superseded.
- Out: admin pages (`ClusterDetailsTab`, `UserDetailsTab`). They have no provider, so their terms stay plain.

## Contract / design notes
ADR-0038 §8.
- `shared/ui/page/FieldHelpContext.tsx`:
  - `interface FieldHelp { kindLabel: string; describe(path: string): string | undefined }`.
  - `FieldHelpContext = createContext<FieldHelp | null>(null)`.
  - Plain React; no k8s imports.
- `DetailsItem({ label, path?, children, 'data-testid' })`, mirroring OCP `DetailsItem`:
  - The popover shows when `path` is set and `describe(path)` returns text. The term is then a `DescriptionListTermHelpText` with a `Popover` + `DescriptionListTermHelpTextButton`.
  - Popover parts: header = label; body = description (scrollable, `maxHeight: min(30rem, 50vh)`); footer = the path breadcrumb `Kind › spec › replicas` (OCP `PropertyPath`); `maxWidth: 30rem`.
  - Without a `path` or a description, the term stays a plain `DescriptionListTerm` (unchanged markup and tests).
- Popover content follows OCP: header + description + path breadcrumb. It has no "type" line; the spec wording "field name, type, description" is superseded by the OCP source (§4c.6).
- `ResourceDetailsTab` builds `describe` from `useOpenApiSchema(cluster, descriptor.model)` + `resolveSchemaPath` (path string split on `.`, OCP style e.g. `spec.strategy.rollingUpdate.maxSurge`, `metadata.labels`). No schema → provider value `null`.
- Call sites: use OCP's `path` values (see OCP references). MetadataSection: `metadata.name`, `.namespace`, `.labels`, `.annotations`, `.creationTimestamp`, `.ownerReferences`.

## Context pack
- Touch points:
  - `web/src/shared/ui/page/DetailsGrid.tsx:DetailsItem` (L36-50).
  - `web/src/features/resources/details/ResourceDetailsTab.tsx:ResourceDetailsTab` (provider goes here).
  - `web/src/shared/k8s/openapi.ts` (`useOpenApiSchema`, `resolveSchemaPath`, T-0210).
  - Call sites: `grep -rn '<DetailsItem' web/src/features/resources`.
- Exemplar test: `web/src/shared/ui/details.test.tsx`.
- OCP reference (`/home/bad/works/openshift-console/frontend/`):
  - `public/components/utils/details-item.tsx:DetailsItem` L46-128 (`PropertyPath`, popover props).
  - Paths in `public/components/deployment.tsx` L48-82, `public/components/pod.tsx` L318-359, and `public/components/utils/details-page.tsx:ResourceSummary`.
  - For the other kinds, `grep -n 'path="' public/components/<kind>.tsx`.
- Parity: `docs/architecture/ocp-parity.md` row 38, waiver W3. `docs/tasks/T-0133-*.md` (set to `done` with "superseded by T-0213 (help) / T-0184+T-0188 (ring scale)").

## Acceptance criteria
- [x] HELP-1: on Pod and Deployment details, terms with an OCP `path` show the dashed underline; the popover shows the label, the cluster's description and `Kind › path`. RTL test with MSW schema.
- [x] Every other resource details page passes OCP's paths. Terms without a description render exactly as before; the 403 cluster renders plain terms with no error.
- [x] Measure the popover against OCP's values (ui-probe); `ocp-parity.md` row 38 → `match`, W3 is closed, and T-0133 is closed with the reason. — partial: probe measured our term only (OCP ref down, probe cannot open popovers); popover values taken from OCP source.
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-24 frontend-engineer: started; FieldHelpContext + DetailsItem `path`, provider in ResourceDetailsTab, OCP paths at call sites.
- 2026-11-24 frontend-engineer: done. FieldHelpContext + DetailsItem `path` popover; provider via `useFieldHelp` in ResourceDetailsTab; OCP paths at all call sites. Tests: details.test.tsx (unit), new ResourceDetailsTab.test.tsx (MSW Pod/Deployment + alice 403). check-fe green (113 files/1196 tests). ui-probe ours-only: OCP ref (:9000) not running.

## Review
### UX (ux-designer, round 1) — APPROVE
- OCP ref :9000 down, so I compared against OCP `public/components/utils/details-item.tsx` L24-128 + `public/style/_common.scss` `.co-pre-line`. I clicked our mock popover with Playwright (Deployment `shop/worker`, lab-1, 1280).
- Term: 14px/600, dashed underline, offset 4px, same as OCP's `DescriptionListTermHelpText` + `DescriptionListTermHelpTextButton` — match.
- Popover: width/maxWidth 480px (`30rem`), header = label, body `Panel isScrollable hasNoBorder` > `PanelMain` max-height 450px (= `min(30rem, 50vh)` at 900px viewport), description `white-space: pre-line` — match.
- Footer: Breadcrumb `Deployment › spec › strategy › rollingUpdate › maxSurge`, kind = `model.kind`, last item `isActive` — match (`PropertyPath`).
- Paths: MetadataSection matches `details-page.tsx:ResourceSummary` L76-156; Deployment matches `deployment.tsx` L48-82.
- Accepted divergence (ADR-0038 §8): OCP still shows the help button (header + footer only) when `path` is set but has no description. We render a plain term, which fits our 403/no-schema case. OCP has no such case because it always loads model definitions. Not a finding.
- Not ported: `LinkifyExternal`, so URLs in descriptions are plain text. The engineer has already noted this as a follow-up. Not blocking.
- 2026-11-24 frontend-architect, round 1: **APPROVE**. Layering is clean: `FieldHelpContext`/`DetailsItem` import only React/PF, and the provider lives in the feature. The schema comes from `useOpenApiSchema`, which shares its query keys and `staleTime: Infinity` with the YAML sidebar, so there are no extra fetches. Call-site paths were spot-checked against OCP and match: namespace `status.phase`, secret `type`, DC `status.details.message`/`spec.triggers`, DS `status.currentNumberScheduled`, ResourceSummary. TSDoc is present. Scoped eslint, tsc and vitest pass (10 files, 112 tests).
  - Nit (optional): `ResourceDetailsTab.test.tsx:L67` — `server.events.on(...)` is never removed. Use `server.events.removeAllListeners()` in an `afterEach`, or remove the listener after it resolves.
  - Nit (optional): Handover notes say "Status / Phase … have no path", but the Namespace Status passes `status.phase` (correctly, as OCP does). Reword the note to "Deployment/Pod Status".

## Handover notes
- `DetailsItem` (`shared/ui/page/DetailsGrid.tsx`): term becomes `DescriptionListTermHelpText` + `Popover` only when a `FieldHelpContext` provider describes `path`; else plain `DescriptionListTerm` (admin pages unchanged).
- Popover = OCP: header label, `Panel isScrollable hasNoBorder` + `PanelMain maxHeight="min(30rem, 50vh)" role=region`, footer `Kind › path` Breadcrumb, `maxWidth="30rem"`. No `LinkifyExternal` (no URLs linkified) — follow-up if wanted.
- Extra files outside `paths`: `shared/ui/page/DetailsGrid.module.css` (`.co-pre-line`), `features/resources/details/ResourceDetailsTab.test.tsx`.
- Node selector / Tolerations paths: `spec.*` for Pod, `spec.template.spec.*` otherwise (OCP `getTolerationsPath`). Pod selector `spec.selector`.
- Service paths (`spec.type`, `spec.clusterIP(s)`, `spec.selector`, `spec.sessionAffinity`) are our choice: OCP's Service details is not in the local clone.
- Status / Phase / Deployment revision / Namespace Display name etc. have no path, as in OCP. ConfigMap/Secret data keys: no path (OCP neither).
- ui-probe (ours only, OCP ref down): help term = 14px/600, dashed underline, offset 4px, pointer — PF6 DescriptionListTermHelpText defaults, same component as OCP. Probe can't open popovers (no clicks); popover values come from OCP source.
- Several call-site files were already not Prettier-clean at HEAD; I didn't reformat them (diff kept to the `path` props).

