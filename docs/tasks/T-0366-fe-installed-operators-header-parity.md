---
id: T-0366
title: Installed Operators header, breadcrumb, overview order and Subscription status (OCP parity)
status: done
owner: frontend-engineer
checkpoint: 5b
depends_on: [T-0337]
paths: [web/src/features/resources/list, web/src/features/resources/details, web/src/features/resources/registry, web/src/features/resources/operators]
review_rounds: 2
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
- [x] List h1 "Installed Operators" with OCP help text; other kinds unchanged.
- [x] Details breadcrumb "Installed Operators > Operator details"; title shows logo, display name, version and provider.
- [x] Overview above the "ClusterServiceVersion details" heading; other kinds' `DetailsTop` unchanged.
- [x] Status cell shows the Subscription status line (OCP copy) from one Subscriptions request.
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-25 frontend-engineer: started; descriptor hooks `listTitle`/`listHelpText`, `detailsCrumbs`, `detailsHeading`,
  `DetailsLead`; PageHeading `leadIcon`; Subscription status line via one shared list query.
- 2026-11-25 frontend-engineer: done; tests extended, ui-probe list heading/help text match OCP styles; in_review.
- 2026-11-25 frontend-engineer: fix round 1: h1 = display name only, provider line via `PageHeading.titleCaption`;
  list Status line plain subtle text (`subscriptionStatusTitle`), none without a Subscription; `BreadcrumbLabels`/`DetailsHeading` types.

## Review
- Round 1 (frontend-architect, 2026-11-25): **CHANGES_REQUESTED**. Hook API is generic and minimal (`listTitle`,
  `listHelpText`, `detailsCrumbs`, `detailsHeading`, `DetailsLead`; PageHeading `leadIcon`, optional `DetailsSubsection`
  title); other kinds unchanged. Requests: one shared Subscriptions list (test asserts it), plus at most one access review, made only
  in namespace scope. That mirrors OCP `canListAllSubscriptions` and does fewer reviews than OCP on all namespaces. Gate green (148 files, 1568 tests, build).
  - `operators/CsvCells.tsx:58-65` + `SubscriptionStatus.tsx:10-34` — the list cell reuses the Subscription tab's variant (icons, "Unknown failure" when no Subscription); OCP `ClusterServiceVersionStatus` renders `SubscriptionStatus muted`: subtle plain title ("Upgrade available"/"Upgrading"/"Up to date"), nothing for no Subscription or another state, approval-required → "Upgrade available" (`clusterserviceversion.tsx` L150-196, `csv-status.ts` L65-88) — add a `muted` prop (or a `subscriptionStatusTitle` helper in `csv.ts`) for the list cell and test the no-Subscription case renders no line.
  - Optional: export one `DetailsCrumbs` type instead of repeating `{ list; details }` in `types.ts` and `ResourceHeader.tsx`. The prettier reflow in CsvDetails/CsvSubscriptionTab/kind is legitimate (`printWidth` 110).
- Round 1 (ux-designer, 2026-11-25): **CHANGES_REQUESTED** (one finding). Checked by mock DOM probe (alice/prod-eu-1) against OCP `clusterserviceversion.tsx`.
  Closed: gap 1 (h1 "Installed Operators" plus help text, L691-695); gap 2 (breadcrumb "Installed Operators > Operator details", 40px logo = OCP `$catalog-item-icon-size-lg`, L1249-1276); gap 3 (overview above "ClusterServiceVersion details", L926-1042); gap 4 (Status cell shows phase plus Upgrade available/Up to date with OCP copy, `subscription.tsx` L160-185).
  Accepted deviations: help text without the docs sentence (OCP hides it on managed clusters too, `!isManaged()` L696, and it links Red Hat docs, so it stays out per the trademark rule); "Cannot update / CatalogSource not found" (a rare failure that costs a second list request; the Subscription tab still shows CatalogSource health).
  1. CSV details h1 — the h1 text includes "1.3.12 provided by Example Community" (`operators/CsvLogo.tsx:52` `CsvHeaderTitle` puts the subtitle inside the heading) — OCP `cluster-service-version-logo.tsx` L52-69: the `Title h1` holds only displayName and the xs subtle provider span is its sibling — render the subtitle outside the h1.
- Round 2 (ux-designer, 2026-11-25): **APPROVE**. Finding 1 fixed: the h1 reads "Cert Utils Operator" only; "1.3.12 provided by Example Community" is a sibling line outside the h1 (12px = pf font-size-xs, subtle rgb(77,77,77)) and the logo is still there, matching OCP `cluster-service-version-logo.tsx` L52-69.
- Round 2 (frontend-architect, 2026-11-25): **APPROVE**. List Status cell now renders `subscriptionStatusTitle` as subtle
  plain text (Upgrade available / Upgrading / Up to date), nothing without a Subscription or for other states, matching OCP
  `SubscriptionStatus muted`; the new test covers up-to-date, approval-required and orphaned rows. `BreadcrumbLabels` is shared
  by `types.ts` and `ResourceHeader.tsx`. Targeted gate green (operators + details, 42 tests).

## Handover notes
- New descriptor hooks (`registry/types.ts`): `listTitle`, `listHelpText`, `detailsCrumbs`, `detailsHeading(obj)` (generic
  badge+name until the object loads), `DetailsLead` (unheaded section above "<Kind> details"). Only CSV uses them.
- Shared UI (outside `paths`, minimal): `PageHeading.leadIcon` (component-groups `PageHeader` icon + vertical divider,
  48px min) and `DetailsSubsection.title` optional (untitled lead section keeps the divider below it).
- Status cell = phase + `subscriptionStatusTitle` as plain subtle text ("Upgrade available" also when approval is
  required, "Upgrading", "Up to date"); no line for other states, without a Subscription, or while loading/on error.
  The Subscription tab keeps the iconed `SubscriptionStatus`. `useCsvSubscriptions` lists Subscriptions all-namespaces
  on the all list or when the user may list them cluster-wide (SSAR), else the route ns (OCP's rule); cells share one
  query (test asserts one list request). `status.reason` line dropped (OCP doesn't show it).
- Details heading: `detailsHeading` returns `{ leadIcon, title, caption }`; caption renders via `PageHeading.titleCaption`
  (subtle xs line under the h1, outside it), so the h1's name is the display name only.
- Not done: OCP's "Cannot update / CatalogSource not found" in the list cell (needs a CatalogSources list, a second
  request) and the help text's docs-link sentence (external Red Hat docs URL); follow-ups if wanted.
- Probe: list h1/help text styles match; OCP help text wraps to 2 lines only because of that docs sentence. The
  details header wasn't probed against OCP (no CSV name known on the reference cluster).
