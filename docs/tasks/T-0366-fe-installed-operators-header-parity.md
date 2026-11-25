---
id: T-0366
title: Installed Operators header, breadcrumb, overview order and Subscription status (OCP parity)
status: todo
owner: frontend-engineer
checkpoint: 5b
depends_on: [T-0337]
paths: [web/src/features/resources/list, web/src/features/resources/details, web/src/features/resources/registry, web/src/features/resources/operators]
review_rounds: 0
---

## Goal
Close the four OCP parity gaps that T-0337 left because they need generic registry hooks. An OCP user notices them
first: the page says "ClusterServiceVersions" where OCP says "Installed Operators". This must land before CP 5b closes.

## Scope
- In: an optional per-descriptor list title + help text, details title + breadcrumb, a lead slot above the
  "<Kind> details" section, and the Subscription status line in the CSV Status cell.
- Out: operator actions, OperatorHub, operand tabs, the Technology Preview migration cells.

## Contract / design notes
UX findings (screen — problem — OCP reference — fix):
1. CSV list — h1 "ClusterServiceVersions", no help text — `clusterserviceversion.tsx` L691-695 — h1 "Installed Operators"
   plus help text "Installed Operators are represented by ClusterServiceVersions within this Namespace." (OCP's
   ListPage `helpText`, below the title). Keep the nav label "Installed Operators".
2. CSV details — breadcrumb "ClusterServiceVersions > ClusterServiceVersion details", h1 "CSV badge + metadata.name" —
   L1249-1276: breadcrumb "Installed Operators > Operator details"; `OverrideTitle` = `ClusterServiceVersionHeaderTitle`
   (logo, `spec.displayName`, "<version> provided by <provider>", no kind badge). Reuse `CsvLogo`.
3. CSV Details tab — overview (Provided APIs, Description | Provider…Maintainers) renders under the
   "ClusterServiceVersion details" heading (`DetailsTop` sits inside `DetailsSubsection`, `ResourceDetailsTab.tsx` L48-50) —
   L926-1042: the overview is its own PaneBody (Grid 9/3) *above* a second PaneBody headed "ClusterServiceVersion
   details" — add a lead slot (e.g. `DetailsLead`) rendered before the subsection; move `CsvOverview` there.
4. CSV list Status cell — phase + reason only — L370-385 `CsvStatusCell` → `ClusterServiceVersionStatus` +
   `subscription.tsx` L160-185 (Upgrading / Up to date / Cannot update / state) — list Subscriptions once per
   namespace scope (one request, no per-row fetch) and add the line under the phase.

## Context pack
- Touch points: `list/ResourceListPage.tsx:101` (title = `model.labelPlural`), `details/ResourceHeader.tsx:45`
  (breadcrumb), `details/ResourceDetailsTab.tsx:48-60`, `registry/types.ts:140` (`DetailsTop`),
  `registry/kinds/clusterserviceversions.tsx`, `operators/CsvLogo.tsx`, `operators/CsvCells.tsx`.
- OCP reference: `/home/bad/works/openshift-console/frontend/packages/operator-lifecycle-manager/src/components/clusterserviceversion.tsx`
  (L691 title/helpText, L926-1042 details layout, L1239-1276 DetailsPage), `subscription.tsx` L160-185.
- Mock: `/c/prod-eu-1/k8s/all-namespaces/clusterserviceversions?mockUser=alice` (cert-utils-operator.v1.3.12).

## Acceptance criteria
- [ ] List h1 "Installed Operators" with OCP help text; other kinds unchanged.
- [ ] Details breadcrumb "Installed Operators > Operator details"; title shows logo, display name, version and provider.
- [ ] Overview above the "ClusterServiceVersion details" heading; other kinds' `DetailsTop` unchanged.
- [ ] Status cell shows the Subscription status line (OCP copy) from one Subscriptions request.
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
