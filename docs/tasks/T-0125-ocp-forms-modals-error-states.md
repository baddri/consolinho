---
id: T-0125
title: OCP parity — full-page forms, 404 / not-available / error states, modal check
status: todo
owner: frontend-engineer
checkpoint: 3.6
depends_on: [T-0119]
paths: [web/src/shared/ui, web/src/features/admin/clusters/form, web/src/features/admin/clusters/ClusterFormPage.tsx, web/src/features/cluster-context, web/src/app/RouteErrorPage.tsx, web/package.json]
review_rounds: 0
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
- [ ] Side-by-side `/admin/clusters/new` vs OCP deployment form and `/nope-404` vs OCP `/nope-404` match at 1280 in
      light and dark (field width, sticky footer, 404 illustration and copy).
- [ ] Delete Deployment shows the dependents checkbox; the request uses the chosen propagation policy.
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
