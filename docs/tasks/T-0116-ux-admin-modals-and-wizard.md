---
id: T-0116
title: Modals and the grant wizard — one close control, OCP sizes, delete copy, label placement
status: todo
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
- [ ] Grant wizard: exactly one close button (`getAllByRole('button', { name: /close/i })` length 1), no modal surface
      visible beside the wizard at 1280 and 1920, Escape closes it, both themes.
- [ ] No modal shows a label in the header's top-right; environment label follows the title text.
- [ ] Delete confirms read "Delete <kind>?" with warning icon and bold names; button danger.
- [ ] 404 page has an h1 heading at the top-left and an empty state below.
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
