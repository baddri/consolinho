---
id: T-0126
title: OCP parity — Fleet administration lists and details on the OCP list/details patterns
status: todo
owner: frontend-engineer
checkpoint: 3.6
depends_on: [T-0121, T-0122]
paths: [web/src/features/admin]
review_rounds: 0
---

## Goal
Fleet administration is a fleet invention, so it must look like an OCP resource area: same list toolbar, badges,
status icons and details heading as T-0121/T-0122. Absorbs T-0118 items 6–9 and the `WorstExpiryIcon` rename of item 10.

## OCP reference
- Routes: `/k8s/cluster/user.openshift.io~v1~User` (list + empty state), `/k8s/cluster/user.openshift.io~v1~User/<name>`;
  list/details patterns from `/k8s/ns/openshift-console/pods`.
- Source: `public/components/user.tsx`, `packages/console-app/src/components/data-view/ConsoleDataView.tsx`,
  `public/components/utils/headings.tsx`, `public/components/utils/details-page.tsx`,
  `packages/console-dynamic-plugin-sdk/src/app/components/status/Status.tsx`.

## Differences to fix
1. Users, Clusters, Credentials, Audit lists — own toolbar (search + selects) — use the T-0121 DataView toolbar
   (category select Name/attributes, `/` hint, chips, Manage columns, compact pagination top/bottom).
2. Names — plain links — `ResourceLink` with kind badge using OCP's abbreviation rule and default colour
   (`#2b9af3`): User "U", Cluster "C", Credential "C" (OCP rule = capitals of the kind; frontend-architect may pick a
   distinct fleet abbreviation, recorded in UX.md).
3. Heading help text — large gap under the title — OCP `PageHeading` `helpText` sits directly under the title
   (Users: 154→188px in the OCP shot); mirror spacing.
4. Status — "Disabled"/"Deactivated" plain text, "Pending" hourglass [T-0118 #8] — OCP `Status.tsx`: ban icon for
   disabled-like states, in-progress icon for Pending, green check Active/Enabled/Valid/Passed, red exclamation
   Failed, yellow triangle Expires soon, ban icon Expired (OCP maps Expired to ban).
5. Details headings (user, cluster) — subtitle under the title, outlined status label, no badge — OCP: badge (lg) +
   name + status `Badge isRead`, star, Actions; display name moves into the DescriptionList.
6. Clusters list — API URL middle-truncated [T-0118 #6] — hide below 2xl (column management); Credentials list — clamp
   legacy-token description to 2 lines [T-0118 #6].
7. Cluster Credentials tab — "Add credential" placement [T-0118 #7] — right-aligned in the toolbar like "Grant access".
8. User details — two grant entry points [T-0118 #9] — toolbar "Grant access" opens the wizard (1..n clusters);
   drop the Actions item.
9. Rename `WorstExpiryIcon`/`WorstExpiryStatus` to what it renders [T-0118 #10].
10. Deactivate user modal copy [T-0125 visual review]: the body repeats the title's question and says "lose access to
    all 1 cluster" — drop the repeated question, pluralise correctly ("1 cluster" / "N clusters").

## Context pack
- Docs: `UX.md` §3, §5, §6.
- Touch points: `web/src/features/admin/users/*` (list, details), `admin/clusters/ClustersListPage.tsx`, `ClusterRow.tsx`,
  `ClusterDetailHeader.tsx`, `ClusterStatusLabel.tsx`, `WorstExpiryStatus.tsx`, `clusterFilters.ts`,
  `admin/credentials/*`, `admin/audit/*`, `admin/grants/*`; shared pieces from T-0121/T-0122.

## Acceptance criteria
- [ ] Side-by-side `/admin/users` vs OCP `/k8s/cluster/user.openshift.io~v1~User` (heading/help text/toolbar) and
      `/admin/clusters/prod-eu-1` vs OCP pod details (heading/DescriptionList) match at 1280 in light and dark.
- [ ] All four admin lists use the shared toolbar and status component; T-0118 items 6–9 visible in the mock UI.
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
