---
id: T-0337
title: Installed Operators — CSV list and details, Subscription tab (read-only)
status: done
owner: frontend-engineer
checkpoint: 5b
depends_on: [T-0336]
paths: [web/src/features/resources/operators, web/src/features/resources/registry/kinds/clusterserviceversions.tsx, web/src/mocks/k8s/clusterFixtures.ts, web/package.json, web/package-lock.json]
review_rounds: 2
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
- [x] OLM-1: Operators > Installed Operators; all-projects request carries `labelSelector=!olm.copiedFrom` (MSW assertion); hidden on `prod-k8s-1`.
- [x] OLM-2: columns incl. icon from data URI only (remote URL test → placeholder), status icons, Provided APIs overflow.
- [x] OLM-3: markdown rendered, embedded `<script>`/raw HTML not rendered (test).
- [x] OLM-4: Subscription tab incl. "Requires approval"; "No Subscription found" case.
- [x] OLM-5: no Edit/Delete; YAML read-only.
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-25 frontend-engineer: started; mirrored OCP `clusterserviceversion.tsx`, `useClusterServiceVersionColumns.ts`, `subscription.tsx`.
- 2026-11-25: added `react-markdown` 10.1.0 (MIT, exact pin) for descriptions: `skipHtml`, default `urlTransform`, `img` disallowed, links `noopener noreferrer`; beats a hand-rolled parser.
- 2026-11-25: list, details (overview/sidebar/Conditions), read-only Subscription tab, fixtures, `installedOperators.test.tsx`; empty-state copy = OCP "No Operator Subscription" (task said "No Subscription found"; OCP copy wins per north star).
- 2026-11-25: probe: OCP reference cluster's CSV list never left skeletons and has no matching CSV, so only headings/layout compared; ready for review.
- 2026-11-25 fix round 1: markdown `urlTransform` = `httpUrl` (moved to csv.ts; relative/mailto/javascript: → plain text, tested); `MarkdownView` lazy-loaded — build puts react-markdown only in `MarkdownView-*.js` (123.6 kB).

## Review
- Round 1 (ux-designer, 2026-11-25): **APPROVE**, with follow-up T-0366 required before CP 5b closes. Checked by mock DOM probe
  (alice/prod-eu-1) against OCP `clusterserviceversion.tsx` and `subscription.tsx`.
  Matches: list columns Name, Namespace, Managed Namespaces, Status, Provided APIs, Last updated, with "<v> provided by <p>"
  and "View 1 more..."; tabs Details·YAML·Subscription·Events; overview Grid 9/3 with Provided APIs, Description and
  Provider/Created at/Links/Maintainers; Status, Status reason, Operator Deployments; Subscription details terms, order and
  "Upgrade status"; empty state "No Operator Subscription".
  - Gap 1, list title "ClusterServiceVersions" with no help text (OCP L691-695 "Installed Operators" plus help text): follow-up T-0366 (needs a generic list-title hook).
  - Gap 2, details heading and breadcrumb (OCP L1249-1276 "Installed Operators > Operator details", logo/name/version/provider title): follow-up T-0366 (breadcrumb added there too).
  - Gap 3, overview inside the "ClusterServiceVersion details" section (OCP L926-1042 puts it in its own PaneBody above): follow-up T-0366 (needs a lead slot in `ResourceDetailsTab`).
  - Gap 4, no Subscription status line (OCP `CsvStatusCell` L370-385 / `subscription.tsx` L160-185): follow-up T-0366 (one Subscriptions request, no per-row fetch).

- Round 1 (frontend-architect, 2026-11-25): **CHANGES_REQUESTED**. Raw HTML off (`skipHtml`), `img` disallowed, icons
  limited to allowlisted image types with strict base64, `spec.links` http(s)-only: OK. react-markdown justified (MIT, exact
  pin, no `dangerouslySetInnerHTML`). Descriptor/engine fit OK; operators + registry tests 53/53, lint/typecheck green.
  - `operators/MarkdownView.tsx:22` — default `urlTransform` still passes relative, `mailto:`, `irc:`, `xmpp:` links, not http(s)-only as specified — move `httpUrl` (`CsvDetails.tsx:37`) to `csv.ts` and pass `urlTransform={(url) => httpUrl(url) ?? ''}` (+ test with a relative and a `javascript:` link).
  - `operators/CsvDetails.tsx:32` — react-markdown/micromark land in the `registry-*` chunk, which the nav loads eagerly (`nav/useClusterNav.ts:4`), so every first page load pays for it — load `MarkdownView` with `React.lazy` + `Suspense` (default export or `.then(m => ({ default: m.MarkdownView }))`) so it gets its own chunk.
  - Follow-ups: list title/help text, details heading/breadcrumb, overview lead slot, Subscription status line are filed in T-0366 (out of scope here: generic engine hooks). InstallPlan/CatalogSource/OperatorGroup/ServiceAccount links need new registered kinds: filed T-0367 (backlog).
- Round 2 (frontend-architect, 2026-11-25): **APPROVE**. Both fixes verified: `MarkdownView` uses `urlTransform` via shared
  `csv.ts:httpUrl`, and a test covers https/relative/javascript:/mailto:; `CsvDetails` lazy-loads it behind a Skeleton `Suspense`, and
  the fresh build has micromark/mdast only in `MarkdownView-*.js`. Operators gate green (8/8, lint, typecheck). Optional nit:
  `MarkdownView.tsx:26` doc line exceeds the line width.

## Handover notes
- Code: `web/src/features/resources/operators/` (csv.ts helpers, CsvLogo, CsvCells, CsvDetails, CsvSubscriptionTab, MarkdownView) + descriptor `registry/kinds/clusterserviceversions.tsx`.
- Icon: only `data:` image media types with valid base64 (CSP `img-src 'self' data:`); else PF CubesIcon placeholder.
- Subscription lookup in `olm.operatorNamespace` by `status.installedCSV`, so copied CSVs find it; InstallPlan via `installPlanRef`.
- Status cell = phase + `status.reason` (OCP also shows the Subscription state; would need a list of all Subscriptions — skipped).
- Outside paths, touched: `registry/kinds/kinds.test.tsx` CSV link-name assertions (name cell now shows display name).
- Fixtures: CSV OLM annotations, links, maintainers, markdown (with `<script>`), owned CRDs (5 on cert-utils for overflow), install spec; Subscriptions get `catalogHealth` + RequiresApproval condition.
- Follow-ups (outside paths): list title "Installed Operators" + OCP help text (list page uses `labelPlural`);
  details heading with logo/display name; a `DetailsLead` hook so the overview sits above "ClusterServiceVersion details"
  as in OCP; InstallPlan/CatalogSource/ServiceAccount/OperatorGroup are badges without links (no registered kinds).
