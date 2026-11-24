---
id: T-0337
title: Installed Operators — CSV list and details, Subscription tab (read-only)
status: todo
owner: frontend-engineer
checkpoint: 5b
depends_on: [T-0336]
paths: [web/src/features/resources/operators, web/src/features/resources/registry/kinds/clusterserviceversions.tsx, web/src/mocks/k8s/clusterFixtures.ts, web/package.json, web/package-lock.json]
review_rounds: 0
---

## Goal
Lane O step 3: OLM-1..5 — OCP's Installed Operators list, CSV details and Subscription tab, read-only.

## Scope
- In: CSV descriptor columns/filters/details, `KindTabs.subscription`, markdown description, icon cell.
- Out: OperatorHub, operand (CR) tabs, Uninstall/Edit/Delete, approve InstallPlan, change channel (OLM-5, gaps).

## Contract / design notes
- **List** (OLM-2, `useClusterServiceVersionColumns.ts`, `CsvNameCell`): Name = icon + `spec.displayName` + version,
  provider underneath (OCP layout); Namespace; Managed Namespaces ("All Namespaces" when the OperatorGroup target is
  all — read from the `olm.targetNamespaces` annotation like OCP `ManagedNamespaces`, else the list); Status
  (`status.phase` + `status.reason`; Succeeded success icon, Failed danger, Installing/Pending/Replacing in-progress);
  Last updated (`status.lastUpdateTime`, Timestamp); Provided APIs (`spec.customresourcedefinitions.owned[].displayName`,
  max 4 then "View `<n>` more…" link to details). Filters: Name, Status. "All projects" uses
  `allNamespacesLabelSelector: '!olm.copiedFrom'` (T-0331) — no client-side de-duplication.
- **Icon**: `spec.icon[0]` rendered only when `mediatype` is an image type and data is base64 → `src="data:<mt>;base64,<d>"`
  (CSP `img-src 'self' data:`); never a URL; otherwise PF placeholder icon. Helper `csvIconSrc(csv): string | undefined` + test.
- **Details** (OLM-3, `clusterserviceversion.tsx` details): left Provider, Created at, Links (`spec.links`, external
  link with `rel="noopener noreferrer"`), Maintainers (name + mailto); main Description rendered with
  **react-markdown** (new dependency, latest; default `skipHtml`, no `rehype-raw`, links open external) — mirrors OCP
  `MarkdownView` (marked + sanitize) without `dangerouslySetInnerHTML`; Provided APIs as cards/list (names only, no
  operand links); Conditions (`status.conditions` → `ConditionsTable` columns Phase, Reason, Message, Last updated as OCP).
- **Subscription tab** (OLM-4, `subscription.tsx` `SubscriptionDetails`/`SubscriptionStatus`/`UpgradeApprovalLink`):
  list Subscriptions in the CSV namespace, pick `status.installedCSV === csv.metadata.name`; show Update channel,
  Update approval (Automatic/Manual), Installed version, Starting version, Catalog source (+ namespace), Install plan
  (link text to InstallPlan name, status; "Upgrade available" / "Requires approval" when the InstallPlan
  `spec.approval=Manual` and `spec.approved=false`). Missing → `EmptyState` "No Subscription found". No buttons.
- New dependency: react-markdown is decided here (CLAUDE.md "libraries over hand-rolled"); record it
  in the Work log; `npm ls` license MIT.

## Context pack
- Docs: spec §5b.5 OLM-1..5; FRONTEND.md § The resource registry; SECURITY.md CSP line (`grep -n img-src`).
- Exemplars: `registry/kinds/routes.tsx` (external link cell, safe URL handling); `components/ConditionsTable.tsx`.
- Touch points: `registry/kinds/clusterserviceversions.tsx` (T-0331 minimal), `KindTabs.subscription` (T-0331),
  `shared/k8s/models.ts` Subscription/InstallPlan models (T-0330).
- OCP reference: `/home/bad/works/openshift-console/frontend/packages/operator-lifecycle-manager/src/components/clusterserviceversion.tsx`
  (ClusterServiceVersionsPage, CsvNameCell, CsvStatusCell, CsvProvidedAPIsCell, ManagedNamespaces; copiedFrom L738),
  `useClusterServiceVersionColumns.ts`, `subscription.tsx`; `packages/console-shared/src/components/markdown/MarkdownView.tsx`.

## Acceptance criteria
- [ ] OLM-1: Operators > Installed Operators; all-projects request carries `labelSelector=!olm.copiedFrom` (MSW assertion); hidden on `prod-k8s-1`.
- [ ] OLM-2: columns incl. icon from data URI only (remote URL test → placeholder), status icons, Provided APIs overflow.
- [ ] OLM-3: markdown rendered, embedded `<script>`/raw HTML not rendered (test).
- [ ] OLM-4: Subscription tab incl. "Requires approval"; "No Subscription found" case.
- [ ] OLM-5: no Edit/Delete; YAML read-only.
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
