---
id: T-0387
title: UX review of the namespace-selector fallback, No-namespaces state and Create Namespace modal against OCP (QG55B-4)
status: done
owner: ux-designer
checkpoint: 5.5
depends_on: [T-0382, T-0383, T-0385]
paths: [docs/tasks/T-0387-ux-cp55b-fallback-and-create-namespace-review.md]
review_rounds: 1
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
- [x] Verdict recorded; deviations filed as tasks or accepted with reason.

## Work log
- 2026-11-26 ux-designer: probed the mock UI (5199, alice/admin, 1280, light). Fallback menu on dev-k8s-ns: team-a list, Go-to item, error helper, footer.
  NSF-4 page seen with `/api/clusters` patched in-page to `fallbackNamespaces: []`. Create Namespace on prod-k8s-1: alice disabled+tooltip;
  admin modal seen with the create-namespaces SSAR patched to allowed in-page (no source change). The mock 403 shows inline. OCP ref console was down, so I compared against the clone source.

## Review
**APPROVE** (round 1). One copy deviation, filed as T-0388.
- Selector fallback menu: PF `Menu` > `MenuSearch` / `Divider` / `MenuContent` / `MenuFooter`. Same structure as OCP `NamespaceDropdown.tsx` (L142-187, footer in `MenuFooter`); the "Go to namespace" item comes first, Enter picks it, and the DNS error shows as `HelperTextItem variant="error"`. OK.
- Footer helper text is 12px, regular colour, footer padding 12px 16px (PF default). The menu is 549px wide at 1280 because the one-line footer sets it; that's above OCP's 325px minimum (`NamespaceDropdown.scss` L19-23). Accepted.
- NoNamespacesPage: `EmptyState` h1 20px, `CubesIcon` (subtle 112,112,112), body two sentences, the selector is the single action, no namespace bar above it, no toast. Matches UX.md §10 and NSF-4. OK.
- NoNamespacesPage selector menu: with no configured namespaces the footer still says "Showing the namespaces configured for your access" over an empty list. That's misleading copy, filed as T-0388.
- Create Namespace button: primary, in the heading row (top 135 = h1 top, right edge 1240), "Create Namespace" as OCP `namespace.tsx` L470-477 / `list-page.tsx` L435. OK.
- Create Namespace modal: `small` (560px), one close (X), title "Create Namespace", Name required + `FieldLevelHelp` with OCP's two help paragraphs, Labels tag box (120px min, OCP `.co-tags-input`), footer Create (primary) + Cancel (link), focus on Name. Matches OCP `CreateNamespaceModal.tsx` L156-237. The missing "Default network policy" was descoped by NSC-1. The context line comes before the Form (UX.md §9). OK.
- Server error (403) shows inline as a danger `Alert` above the footer, as in the shared ResourceMutationModal / Create Project precedent. Accepted.
- **NSC-2 for the PO:** keep "visible, disabled with the reason in a tooltip" and change the spec from "hidden". OCP itself doesn't gate Create Namespace at all (`canCreate` is always true, `namespace.tsx` L476) and hides Create Project via `CAN_CREATE_PROJECT` (L857-863). Our CP5a Create Project already shows it disabled with a reason (SAFE5-2), and the button should behave the same on both kinds. The "read-only" grant is a fleet concept, so users should see the reason.

## Handover notes
