---
id: T-0387
title: UX review of the namespace-selector fallback, No-namespaces state and Create Namespace modal against OCP (QG55B-4)
status: todo
owner: ux-designer
checkpoint: 5.5
depends_on: [T-0382, T-0383, T-0385]
paths: [docs/tasks/T-0387-ux-cp55b-fallback-and-create-namespace-review.md]
review_rounds: 0
---

## Goal
Spec QG55B-4: confirm the new CP5.5b UI matches the OCP console (light theme; navy masthead already reviewed in CP3.7).

## Scope
- In: selector fallback menu (list, helper text, Go-to item), `NoNamespacesPage`, Create Namespace button + modal.
- Out: unchanged screens; dark theme unless tokens changed.

## Contract / design notes
Run the mock dev server (cluster `dev-k8s-ns`, T-0381; Create Namespace on `prod-k8s-1` as admin). Probe with
`scripts/ui-probe.mjs` first; clip screenshots to the element. Findings → bug tasks (`file — problem — fix`).
Also give the PO a one-line answer on NSC-2 wording (spec says "hidden" for read-only; T-0385 follows the Create
Project precedent "disabled with reason").

## Context pack
- `docs/architecture/UX.md` (selector and modal sections via `grep -n '^#'`).
- OCP reference: `/home/bad/works/openshift-console/frontend/packages/console-shared/src/components/namespace/NamespaceDropdown.tsx`,
  `/home/bad/works/openshift-console/frontend/packages/console-shared/src/components/modals/CreateNamespaceModal.tsx`.

## Acceptance criteria
- [ ] Verdict recorded; deviations filed as tasks or accepted with reason.

## Work log

## Review

## Handover notes
