---
id: T-0135
title: Actions menu and row kebab use OCP labels ("Edit <Kind>", "Delete <Kind>")
status: done
owner: frontend-engineer
checkpoint: 3.6
depends_on: []
paths: [web/src/features/resources/actions, docs/architecture/ocp-parity.md]
review_rounds: 1
---

## Goal
CP3.6 acceptance blocker B1 (`docs/specs/CP3.6-acceptance.md`): our Actions menu and row kebab say "Edit YAML" and a
red "Delete". OCP's common actions say "Edit <Kind>" and "Delete <Kind>" in normal colour, in OCP's order (plus the
label/annotation edits we don't have yet; those stay out of scope until CP4).

## OCP reference
- `frontend/packages/console-app/src/actions/hooks/useCommonActions.ts`, `useDeploymentActions.ts` (and `locales/en/console-app.json`).
- Our code: `web/src/features/resources/actions/useResourceActions.tsx:72,77` (+ tests, admin `useUserActions` untouched).

## Acceptance criteria
- [x] Details Actions menu and list row kebab show "Edit <Kind>" and "Delete <Kind>" (kind label from the model), not
      danger-coloured, matching OCP's order and wording; read-only/disabled reasons unchanged.
- [x] Side-by-side with the reference console (open the menu only) at 1280, light and dark.
- [x] Parity row for actions corrected; build, lint and tests green.

## Work log
- 2026-11-22 frontend-engineer: started; OCP `useCommonActions.ts` uses `kind.kind` ("Edit Pod", "Delete Pod"), no danger.
- 2026-11-22 frontend-engineer: items now `Edit ${model.kind}` / `Delete ${model.kind}`, `isDanger` dropped; side by side at 1280
  light/dark (menu opened only): text and colour equal OCP's common tail (21,21,21 / 255,255,255). check-fe green.

## Review

### Visual (ux-designer)
APPROVE (2026-11-22; 1280, light+dark, menus opened only; ref `/k8s/ns/openshift-console/deployments[/console]`).
- Details Actions and row kebab: "Edit Deployment", "Delete Deployment", text 21,21,21 / 255,255,255 = OCP's last two items, same colour, no danger (`useCommonActions.ts:82,93`, `deployment-provider.ts:27,33`).
- Note for CP4: OCP's Deployment "Edit Deployment" opens the form editor (`useDeploymentActions.ts:92`, `<path>/form`); ours opens YAML. Recorded in the parity row.

### Code (frontend-architect)
APPROVE (2026-11-22; check-fe green, 811 tests). Titles from `model.kind` as OCP `common-factory.ts` `Edit/Delete {{kind}}`
(`kind.kind`), Edit before Delete as `useCommonActions` tail, `isDanger` removed from type and menu (no stale uses);
access gating untouched; order + no-danger test added. Parity row already landed with the T-0132 commit.
Nit (optional): `itemKey: 'edit-yaml'` now reads oddly next to "Edit <Kind>"; rename to `'edit'` when next touched.

## Handover notes
- `useResourceActions` titles from `model.kind` (OCP uses `kind.kind`, not the label); `ResourceActionItem.isDanger`
  removed, so `ResourceActionsMenu` no longer passes it. Edit still opens the YAML tab, Delete access gating unchanged.
- New test asserts details menu order ["Edit Pod", "Delete Pod"] and no `pf-m-danger`; existing tests renamed.
- OCP lists kind-specific items before these (Edit labels/annotations, Pod count, rollouts...): CP4 scope.
- Parity: new "Actions menu + row kebab items" row; Delete modal row entry renamed "kebab › Delete <Kind>".
