---
id: T-0213
title: Details field-help popovers from the cluster schema (OCP DetailsItem `path`)
status: todo
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
- [ ] HELP-1: on Pod and Deployment details, terms with an OCP `path` show the dashed underline; the popover shows the label, the cluster's description and `Kind › path`. RTL test with MSW schema.
- [ ] Every other resource details page passes OCP's paths. Terms without a description render exactly as before; the 403 cluster renders plain terms with no error.
- [ ] Measure the popover against OCP's values (ui-probe); `ocp-parity.md` row 38 → `match`, W3 is closed, and T-0133 is closed with the reason.
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
