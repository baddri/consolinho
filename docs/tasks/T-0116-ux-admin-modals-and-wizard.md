---
id: T-0116
title: Modals and the grant wizard — one close control, OCP sizes, delete copy, label placement
status: in_review
owner: frontend-engineer
checkpoint: CP3.5
depends_on: [T-0110]
paths: [web/src/features/admin/grants, web/src/features/admin/credentials/*Modal*.tsx, web/src/features/admin/credentials/ClusterCredentialsTab.test.tsx, web/src/features/admin/clusters/DeleteClusterModal.tsx, web/src/features/admin/clusters/DisableClusterModal.tsx, web/src/features/admin/clusters/EnableClusterModal.tsx, web/src/features/admin/clusters/ClusterActions.test.tsx, web/src/features/admin/clusters/ClusterDetailPage.test.tsx, web/src/features/admin/connection-test, web/src/features/admin/users/CreateUserModal.tsx, web/src/features/admin/users/UserActions.test.tsx, web/src/features/resources/actions, web/src/shared/ui/ConfirmModal.tsx, web/src/shared/ui/NotFoundPage.tsx, web/src/shared/ui/uiKit.test.tsx]
review_rounds: 0
---

## Goal
Every modal follows OCP/PF6: exactly one close control, the right size, OCP delete wording, and context labels inline.

## Scope
- In: `BulkGrantWizard`, `ConfirmModal`, `CredentialModalFrame`, `GrantFormModal`, delete/disable/enable cluster
  modals, `DeleteResourceModal`, `CreateUserModal`, `TestConnectionModal`, 404 page.
- Out: modal behaviour/validation.

## Contract / design notes
Structure:
- `ConfirmModal` (shared): `titleLabel` (today rendered in the header `help` slot, L140-145) is rendered inline after
  the title text inside `ModalHeader title`; add `titleIconVariant?: 'warning' | 'danger'` (default `'warning'` when
  `variant="danger"`). Keep the props otherwise stable so callers you don't own (`UserActionDialogs.tsx`,
  `ClusterForm.tsx`, `UnsavedChangesGuard.tsx`) need no edit; their tests must stay green.
- `NotFoundPage`: `PageHeading title="404: Page not found"` + `PageBody` with `EmptyState` (T-0110 blocks).
- Do not edit `users/UserActionDialogs.tsx` (copy owned by T-0115).

Findings:
- Grant wizard (`/admin/users/bob` → Grant access to clusters) — two X buttons and a wider modal surface visible behind
  the wizard on the right — `Modal` gets `onClose` *and* `WizardHeader` has `onClose` (`BulkGrantWizard.tsx:L39-41`,
  `L122-124`) — PF "Wizard in modal": drop `onClose` from `Modal`, add `onEscapePress={onClose}`; the wizard fills the
  modal box (no visible frame around it); keep `aria-labelledby`.
- Test connection / Delete cluster / credential modals — environment label floats top-right next to the X (header
  `help` slot) — UX.md §9 — move the label inline after the title text (`ModalHeader title={<>Title <EnvironmentLabel isCompact/></>}`)
  and keep it in the accessible name.
- Delete cluster — title "Delete dev-2" — OCP "Delete cluster?" with warning icon (`titleIconVariant="warning"`), body
  "Are you sure you want to delete **dev-2**? 1 credential and 1 grant will be removed. This cannot be undone.", then
  the type-to-confirm field; danger "Delete" + link "Cancel". Same wording rule for `DeleteResourceModal`
  ("Delete Deployment?" / "… **web** in namespace **shop**?") and credential/grant/revoke confirms.
- Sizes: confirms `small`, short forms (`CreateUserModal`, `AddCredentialModal`, `GrantFormModal`, test connection)
  `medium` if fields need it, wizard `large`. Footer: primary first, then secondary, then link Cancel.
- 404 — centred EmptyState only — OCP `error.tsx`: page heading "404: Page not found" + empty state body — use
  `PageHeading` + `EmptyState`.

## Context pack
- Docs: `docs/architecture/UX.md` §9, §10, §11.
- Touch points: `web/src/features/admin/grants/bulk/BulkGrantWizard.tsx` (`BulkGrantWizard` L37-44, `Wizard` L121-130),
  `web/src/shared/ui/ConfirmModal.tsx` (L61, header `help` L140-145, footer L170-185),
  `web/src/features/admin/credentials/CredentialModalFrame.tsx:L39-50`, `web/src/features/admin/grants/GrantFormModal.tsx:L95`,
  `web/src/features/admin/clusters/{DeleteClusterModal,DisableClusterModal,EnableClusterModal}.tsx`,
  `web/src/features/admin/connection-test/TestConnectionModal.tsx`, `web/src/features/resources/actions/DeleteResourceModal.tsx`,
  `web/src/features/admin/users/CreateUserModal.tsx`, `web/src/shared/ui/NotFoundPage.tsx:NotFoundPage`.
- Tests: `BulkGrantWizard.test.tsx` (close button count), `GrantsTab.test.tsx`, `ClusterActions.test.tsx`,
  `ClusterDetailPage.test.tsx` and `UserActions.test.tsx` (dialog titles/names only), `ClusterCredentialsTab.test.tsx`,
  `ResourceActions.test.tsx`, `uiKit.test.tsx` (`ConfirmModal`, `NotFoundPage`), `TestConnection.test.tsx`. Dialog
  accessible names change ("Delete cluster?") — query `getByRole('dialog', { name: … })` with the new title.
- Conflicts: `shared/ui` with T-0110 (runs after it); `UserActions.test.tsx`/`ClusterDetailPage.test.tsx` with T-0115
  (T-0115 runs after this). `resources/actions` only here (T-0113 stays out). Parallel-safe with T-0111, T-0112,
  T-0113, T-0114.
- PF: `Modal` (`onClose` renders the X; `onEscapePress`), `ModalHeader titleIconVariant`, `Wizard`/`WizardHeader`.
- OCP: `public/components/modals/delete-modal.tsx` (L90-120), `public/components/error.tsx`.

## Acceptance criteria
- [x] Grant wizard: exactly one close button (`getAllByRole('button', { name: /close/i })` length 1), no modal surface
      visible beside the wizard at 1280 and 1920, Escape closes it, both themes.
- [x] No modal shows a label in the header's top-right; environment label follows the title text.
- [x] Delete confirms read "Delete <kind>?" with warning icon and bold names; button danger.
- [x] 404 page has an h1 heading at the top-left and an empty state below.
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-21 frontend-engineer: started. ConfirmModal: label inline via new `InlineLabelTitle`, `titleIconVariant` (danger →
  warning); credential/grant frames use it; wizard Modal drops `onClose` (+`onEscapePress`), header X named "Close";
  OCP delete/revoke wording with bold names; sizes; 404 = PageHeading + EmptyState. Tests updated; screenshots of all
  changed modals light+dark at 1280 (wizard also 1920): one X each, label after title, no surface beside the wizard.
- 2026-11-21 frontend-engineer: review polish — `InlineLabelTitle` re-exported from `shared/ui`; "Disable/Enable cluster?"
  titles with bold name; env text dropped where the label shows it; "in namespace" in delete resource; TSDoc rewrapped.

## Review
- 2026-11-21 frontend-architect: **APPROVE** (round 1, code only; visuals by ux-designer). check-fe green (705).
  Wizard: Modal without `onClose` + `onEscapePress`, header X named, test covers count + Escape. ConfirmModal props
  stay backward-compatible; danger defaults to warning icon; ids on title spans keep "Warning alert:" out of dialog names.
  Test connection footer "Close" link is OK: it is the modal's secondary/cancel action (same role as "Cancel" in the
  delete confirm footer, UX.md §9 L85); "one close control" means one X, which holds.
- Nits (optional, follow-up task is fine): re-export `InlineLabelTitle`/`InlineLabelTitleProps` from
  `shared/ui/index.ts` and drop the deep imports + comments in `CredentialModalFrame.tsx:6` and `GrantFormModal.tsx:14`;
  `DeleteClusterModal.tsx:15-16`, `DeleteCredentialModal.tsx:40`, `DeleteResourceModal.tsx:24-26` TSDoc lines are
  re-wrapped unevenly (>120 / short lines).

### Visual review
- 2026-11-21 ux-designer: **APPROVE**. Mock UI, admin, light+dark, 1280 (wizard, delete cluster, test connection, 404 also 1920).
- Grant wizard (3 steps): one X (named "Close"), `lg`, wizard fills the box, no surface beside it; Escape closes; last step "Grant access" — OK.
- Delete cluster / credential / Deployment, Revoke: warning icon, "Delete <kind>?", bold names, `sm`, danger + link Cancel — OK.
- Env label inline after title in all modals (test connection, add/rotate credential, grant, enable/disable, deletes) — OK.
- Sizes: confirms `sm`; Add user, Add/Rotate credential, Grant, Test connection `md` — OK. 404: h1 top-left + EmptyState — OK.
- Test connection footer "Close" link + X: acceptable — OCP modals routinely pair the X with a footer dismiss link; §9 "one close control" = one X.
- Nit (follow-up): Delete resource says "in project shop"; OCP admin `delete-modal.tsx` says "in namespace" — keep if deliberate (matches Project selector).
- Nit (follow-up): Disable/Enable titles "Disable dev-1" lack OCP "<Verb> cluster?" form; Revoke/Disable bodies repeat env as "(development)" next to the label.

## Handover notes
- `InlineLabelTitle` (in `shared/ui/ConfirmModal.tsx`, exported from `shared/ui`) puts a context label after a modal title.
- Ids for `aria-labelledby` sit on the title text spans, so PF's "Warning alert:" SR text stays out of dialog names;
  the h1 name does include it (tests match `/^Warning alert: ?…/`).
- Titles: "Delete cluster?", "Delete credential?", "Delete <Kind>?", "Revoke access?", "Disable/Enable cluster?"; body names
  object/namespace/cluster in bold. Test connection keeps its footer "Close" link.
- Wizard X had no accessible name before (PF default) — now `closeButtonAriaLabel="Close"`.
- Sizes: CreateUser, AddCredential, RotateCredential now `medium`; confirms `small`; wizard `large`.
- Long titles: label is inside PF's single-line ellipsis span, so a very long title can clip the label (accepted by UX §9).
