---
id: T-0125
title: OCP parity — full-page forms, 404 / not-available / error states, modal check
status: done
owner: frontend-engineer
checkpoint: 3.6
depends_on: [T-0119]
paths: [web/src/shared/ui, web/src/features/admin/clusters/form, web/src/features/admin/clusters/ClusterFormPage.tsx, web/src/features/cluster-context, web/src/app/RouteErrorPage.tsx, web/package.json, web/src/shared/k8s, web/src/features/resources]
review_rounds: 2
---

## Goal
Forms, the 404 page and error states must use OCP's layout and copy.

## OCP reference
- Routes: `/k8s/ns/openshift-console/deployments/~new/form` (screenshot only), `/nope-404`.
- Source: `public/style/_forms.scss` (`.co-m-pane__form` L48-51), `packages/console-shared/src/components/form-utils/
  FormFooter.tsx` + `FormFooter.scss`, `FormBody.tsx`, `FlexForm.tsx`, `FormHeader.tsx`; `public/components/error.tsx`
  (`ErrorPage404` L11-50, `ErrorState`); `packages/console-shared/src/components/status/StatusBox.tsx`;
  `public/components/modals/delete-modal.tsx`.

## Differences to fix
1. Register/Edit cluster — fields ≈880px wide — OCP `.co-m-pane__form` max-width 650px above 768px — apply to the form
   field column (CSS module, comment cites `_forms.scss`).
2. Register cluster — breadcrumb above the title — OCP create pages ("Create Deployment") have none — drop it on create;
   keep on edit (OCP edit forms keep the details breadcrumb only when reached from details; frontend-architect
   confirms against `FormHeader.tsx`).
3. Form buttons — at the end of the scroll — OCP `FormFooter`: `PageSection stickyBase="bottom"` with
   `--pf-t--global--box-shadow--sm--top` when stuck, padding = page gutters, Create/Save primary + Cancel secondary
   (`ButtonBar` error alert above) — mirror. OCP Cancel is `secondary`, not `link` (UX.md §8).
4. 404 — h1 "404: Page not found" + search icon + "This page does not exist" + primary "Go to home" — OCP
   component-groups `ErrorState`: `NotFoundIcon` illustration, `headingLevel="h1"`, title "404: Page Not Found",
   body "We couldn't find that page.", footer link button "Return to homepage"; document title "Page Not Found (404)".
   Use `@patternfly/react-component-groups` (frontend-architect confirms dependency) or an equivalent `EmptyState`.
5. Cluster not available — same old layout — reuse the 404 layout: title "Cluster <name> is not available", body "It
   does not exist or you don't have access.", footer "Return to homepage" + "Select a cluster" (opens switcher) [T-0097].
6. Load errors — verify `ErrorState`/Retry against OCP `ErrorState` (`error.tsx` L60+) and `StatusBox`; align icon,
   title "Error loading <plural>" style copy.
7. Modals — delete modal matches `delete-modal.tsx` (small, warning icon in title, danger Delete + link Cancel);
   OCP Deployment delete adds checkbox "Delete dependent objects of this resource" (checked) — add it for kinds with
   owners (propagationPolicy Foreground/Background mapping as OCP). Re-check wizard/admin modals at 1280 dark.

## Context pack
- Docs: `UX.md` §8, §9, §10.
- Touch points: `web/src/features/admin/clusters/ClusterFormPage.tsx`, `clusters/form/*`; `web/src/shared/ui/NotFoundPage.tsx`,
  `ErrorState.tsx`; `web/src/features/cluster-context/ClusterNotAvailablePage.tsx`; `web/src/app/RouteErrorPage.tsx`;
  `web/src/features/resources/actions/DeleteResourceModal.tsx`, `useDeleteResource.ts`.
- PF: `PageSection isStickyStuck stickyBase`, `ActionGroup`, component-groups `ErrorState`/`NotFoundIcon`, `Checkbox`.

## Acceptance criteria
- [x] Side-by-side `/admin/clusters/new` vs OCP deployment form and `/nope-404` vs OCP `/nope-404` match at 1280 in
      light and dark (field width, sticky footer, 404 illustration and copy).
- [x] Delete Deployment shows the dependents checkbox; the request uses the chosen propagation policy.
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-22 frontend-engineer: shared `form-page/` (FlexForm/FormBody/FormFooter, 650px column, sticky footer) used by
  the cluster form; 404 + cluster-not-available on component-groups `ErrorState`; `LoadError` for k8s load failures;
  delete dependents checkbox → `DeleteOptions.propagationPolicy`. Side-by-side 1280 light/dark vs OCP checked; gate green.
- 2026-11-22 frontend-engineer (fix r1): form headings `hideFavorite`; resource 404 = `NotFoundPage` (NotFoundIcon,
  "404: Page Not Found", h2 under the details h1, kind/name/cluster sentence + list link); delete body as plain block;
  `ConfirmModal` footer `Flex spaceItemsSm`; `PropagationPolicy` moved to `models.ts`; paths widened. Gate green.

## Review

### Code (frontend-architect)
**APPROVE** (round 1, gate re-run: lint/typecheck/build ok, 802 tests).
- Delete: body `{kind:'DeleteOptions',apiVersion:'v1',propagationPolicy}` + `Content-Type: application/json` is what the
  API server takes on DELETE and exactly OCP `delete-modal.tsx` L43-45 (checked → kind's policy, unchecked → `Orphan`).
  The proxy forwards DELETE bodies unchanged (MutationGuard/audit key on method+path; body-limit policy is far above).
  Our kinds with an OCP policy are only Deployment and ReplicaSet, so that is correct. MSW test checks both bodies.
- `clusterSwitcherRequest.ts` is internal to cluster-context, not exported, no cross-feature import; it carries UI
  open state, not app state, so the URL rule doesn't apply. An integration test covers it. OK.
- `FormPage.tsx`: there is no `FormEventHandler` in the file any more. `FormProps['onSubmit']` resolves to React 19's
  `SubmitEventHandler`, so the editor warning is stale and nothing needs replacing.
- `LoadError`/`RouteErrorPage`/`NotFoundPage` match OCP `LoadError`, `error.tsx` `ErrorState` and `ErrorPage404`.
  `refetch` in place of OCP's `window.location.reload()` is a better choice. The React 19 `<title>` is placed before
  index.html's `<title>`, so it takes effect.
- Nit (optional) `shared/k8s/models.ts:24`: type as `Exclude<PropagationPolicy, 'Orphan'>` to keep one union.
- Nit (optional) `features/resources/components/ResourceErrorState.tsx:43-45`: TSDoc lines over 110 cols; rewrap.
- Nit (optional) prettier-only churn in `shared/k8s/{hooks,watchManager,client.test}.ts`, `EnvironmentBanner`,
  `NamespaceSelector`, `NoClustersPage`. It is correct but off-task, so keep it out of future diffs.
- Nit (optional) `FormFooter` is always `isStickyStuck`, but OCP passes `sticky`. A permanent shadow is a ux-designer
  call. Frontmatter `paths` leaves out `shared/k8s` and `features/resources`; the orchestrator should add them.
- Round 2: **APPROVE**. Re-checked `hideFavorite`, the missing-object `NotFoundPage` (h2 via the new `headingLevel` prop,
  list link), `ConfirmModal` `Flex spaceItemsSm`, the single `PropagationPolicy` union, the rewrapped TSDoc and `paths`.
  My first gate run failed with an incomplete log (probably ran alongside another run); the re-run passed, 802 tests.

### Visual (ux-designer)
**CHANGES_REQUESTED** (round 1; mock UI vs reference console, 1280 + 1920, light + dark).
- OK form: field column 650px at 1280 and 767px at 1920, the same as OCP `_forms.scss` `.co-m-pane__form` (650 → 50%).
  h2 sections, footer always stuck with a top shadow (OCP `DeploymentForm.tsx` passes `sticky`, so always-on is right),
  primary + `secondary` Cancel. No breadcrumb on create, kept on edit. "Register" accepted (fleet verb).
- Register/Edit cluster: the heading shows the favourite star, but OCP forms use `FormHeader.tsx` (h1 only, no star; see
  the ref shot of Create Deployment). Fix: `hideFavorite` on both `PageHeading`s in `ClusterFormPage.tsx`.
- OK 404 (`/c/dev-1/nope-404`): matches `error.tsx` `ErrorPage404` (NotFoundIcon, h1, copy, link, tab title "Page Not
  Found (404)") in both themes. Body at 16px accepted (PF 6.7 token, no custom CSS). OK cluster-not-available (fleet).
- Pod details 404 (`/k8s/ns/shop/pods/does-not-exist`): shows a search icon and "Pod … not found on dev-1". OCP
  `StatusBox.tsx` L49 shows `ErrorPage404` inside the details tab. Fix: `NotFoundIcon` + h1-style title "404: Page Not
  Found" like the 404 page. The fleet sentence about another cluster/project can stay as the body.
- Delete modal: 16px gap between the question and the checkbox. OCP puts the `Checkbox` straight under the text (body 50
  vs our 66px; `delete-modal.tsx` L105-130). Fix: drop the `<p>` bottom margin (OCP uses a plain `div`).
- Modal footer: Delete–Cancel gap is 16px, OCP `ModalFooterWithAlerts.tsx` uses `Flex spaceItemsSm` (8px; Cancel x=490
  vs our 498). Fix it in the shared `ConfirmModal` footer so every confirm modal matches.
- OK delete modal otherwise: 560px width, warning icon, danger Delete + link Cancel, checkbox checked by default, one close.
- OK "Error loading Deployments" (ines, expired credential): matches `LoadError.tsx` (sm empty state, message, inline
  link "Try again"; toolbar hidden like `ConsoleDataView` → `StatusBox`). The router error boundary was not exercised in the mock UI.

**APPROVE** (round 2; 1280 light + dark vs the reference console, delete modal opened and cancelled only).
- Fixed: Register/Edit cluster headings have no star, as in OCP `FormHeader.tsx`.
- Fixed: a missing object on a details page shows `NotFoundIcon` + "404: Page Not Found", as in `StatusBox.tsx` L49 →
  `ErrorPage404`. The fleet body and the "View <Kinds> in <ns>" link are accepted as fleet additions.
- Accepted deviation: no details tabs on a missing object. OCP keeps them, but every tab shows the same 404 there, so
  they add nothing. This predates the task. Noted in ocp-parity.md.
- Fixed: delete modal 560x193, body 50px, Cancel at x=490, all the same as OCP (`delete-modal.tsx`, `ModalFooterWithAlerts`
  `spaceItemsSm`). User deactivate (admin) matches with the same 8px spacing.
- Follow-up (out of scope, copy): the Deactivate user body repeats the title question and says "lose access to all 1
  cluster". Fix the plural (`useUserActions.tsx` / `UserActionDialogs.tsx`) and drop the repeated question.

## Handover notes
- Full-page forms: `FlexForm` > `FormBody` (sections) + `FormFooter` (alerts as children, `ActionGroup` as `actions`),
  from `@/shared/ui`. Outer element is PF `Form` (flex column) so footer inherits form vars.
- `NotFoundPage` takes `title/body/footer/documentTitle` overrides (OCP `ErrorPage404` style); `ReturnToHomepageButton`
  exported. Tab title via React 19 `<title>` (no app-wide title system yet).
- "Select a cluster" uses `clusterSwitcherRequest.ts` (in-module signal); on mobile the sidebar is closed, so the menu
  opens detached from a hidden toggle — acceptable, revisit if mobile matters.
- `K8sModel.propagationPolicy` (Deployment, ReplicaSet = Foreground as OCP); `k8sDelete` takes an optional policy.
- Resource load errors now read "Error loading <Kinds>" + "Try again" (`LoadError`); admin pages keep `ErrorState` alert.
- Outside paths: `shared/k8s` (model + client), `features/resources` (delete modal/hook, ResourceErrorState, tests).
- Deviations: verb "Register" not "Create"; empty-state body 16px is PF 6.7 (OCP's 6.6 renders 14px).
