---
id: T-0310
title: CP5a UX — ui-probe and OCP side-by-side of Networking/Storage pages and the two new modals
status: todo
owner: ux-designer
checkpoint: 5a
depends_on: [T-0301, T-0302, T-0303, T-0304, T-0305, T-0306, T-0307, T-0308, T-0309]
paths: [docs/architecture/UX.md, docs/architecture/ocp-parity.md, docs/tasks/]
review_rounds: 0
---

## Goal
Every CP5a screen looks like its OCP counterpart before QA writes the parity gate (QG5A-3).

## Scope
- In:
  - Probe (`scripts/ui-probe.mjs`, 1280×800, light; dark only where tokens changed) the Routes / Ingresses /
    NetworkPolicies / PVC / PV / StorageClass lists and details, the Expand PVC and Create Project modals, and the
    Networking + Storage nav sections (order, labels).
  - Text diff (h1, column titles, tab names, details terms, empty-state copy) against OCP source, or live OCP only if
    the human provides a read-only one; record which.
  - Decide the open UX calls the FE tasks recorded: Create Project "Learn more" link omission (T-0309), Route TLS
    cert/key "Set/Not set" rendering (T-0303, SAFE5-4), Service Pods-tab empty state copy (T-0301), Expand PVC fleet
    copy (T-0308).
  - File one fix task per mismatch (next free T-number, owner frontend-engineer).
- Out: code changes beyond trivial CSS values.

## Context pack
- Tools: `scripts/ui-probe.mjs` (T-0138); mock `?mockUser=admin` and a read-only user for disabled states.
- Fixtures: `web/src/mocks/k8s/networkingStorageFixtures.ts` (T-0300) — `web`, `rejected` routes; `db-data`, `scratch`
  PVCs; `standard-csi` SC.
- OCP reference: networking-console-plugin `src/views/{routes,ingresses,networkpolicies}/` (via
  `gh api repos/openshift/networking-console-plugin/contents/<path>`); `/home/bad/works/openshift-console/frontend/public/components/{persistent-volume-claim,persistent-volume,storage-class,namespace}.tsx`,
  `public/components/modals/expand-pvc-modal.tsx`, `packages/console-shared/src/components/modals/CreateProjectModal.tsx`.

## Acceptance criteria
- [ ] Probe + text-diff tables in the Work log (one line per page/modal).
- [ ] The four open UX calls decided and written in the Work log; UX.md updated if a rule changes.
- [ ] Mismatches fixed (trivial CSS) or filed as tasks.

## Work log

## Review

## Handover notes
