---
id: T-0267
title: CP4.5a UX parity pass — Subject section, Access tab columns, Groups, Effective access (QG-5)
status: done
owner: ux-designer
checkpoint: 4.5a
depends_on: [T-0262, T-0264, T-0265]   # can run on `npm run dev:mock` before the BE lands; parallel with T-0266
paths: [docs/architecture/ocp-parity.md, docs/architecture/UX.md, docs/tasks/]
review_rounds: 0
---

## Goal
Record that the CP4.5a screens look and behave like their OCP counterparts (QG-5), and file gaps as tasks.

## Scope
- In: probe (`scripts/ui-probe.mjs`) + targeted clipped screenshots of: Grant access modal Subject section (both kinds),
  cluster Access tab with mixed grants, Groups list, Group details (Details + Cluster access), user Effective access (collapsed + expanded), light theme; dark only if tokens changed.
- Out: code changes (gaps → new FE tasks).

## Context pack
- Docs: `UX.md` § 0, § 5, § 6, § 8, § 9; `ocp-parity.md` (append rows, same format).
- OCP references: `/home/bad/works/openshift-console/frontend/public/components/RBAC/bindings.tsx` (Subject section L687-729, list columns L89-134), `public/components/group.tsx` (list L72-125, details L199-218). Effective access has no counterpart — judge against OCP details-tab and compact table conventions.
- Mock personas: `?mockUser=admin` (full), a read-only admin persona for UIG-6; `setMockHostGroups` states are test-only, so check the UIG-2 alert in the component test output instead.

## Acceptance criteria
- [x] One `ocp-parity.md` row per screen above with verdict `match` or `gap → T-xxxx`.
- [x] Copy checked verbatim against spec §4.3–§4.5 and §5.
- [x] Gaps filed as FE tasks with `checkpoint: 4.5a`.

## Work log
- 2026-11-24 ux-designer: mock :5199 (admin, ines), 1280 light, probe ours-only + clipped shots; OCP from source (ref console not started, memory limit). 6 parity rows added.
  Copy verbatim vs §4.3-4.5/§5 OK (UIG-2/3/5, GPG-4 hint, EFF-1/2/5, revoke confirm); UIG-2 alert verified in `GrantFormModal.test.tsx` (passes).
  Gaps → T-0269 (1 blocking: Access tab headers truncate at 1280; group details section border; wizard review lacks priority; grant form 56px gap),
  T-0270 (em dash → `-`, settled in UX.md §11; ResourceDetailsPage tab panel name). Wizard probed vs PF/OCP source values (T-0264 note closed).

## Review

## Handover notes
- Both follow-ups below are filed as T-0270. PO question (not filed): bulk/single grant toasts say "ReadOnly"/"ReadWrite"
  (`grantText.ts:ACCESS_MODE_TOAST`, spec GRANT-4 wording) — an enum value in copy (UX.md §11); suggest "read-only access".

- Follow-up (T-0263 UX review): admin details pages use `—` as the empty placeholder while lists and OCP use `-` (`console-shared/src/constants/ui.ts` DASH). Settle it once in UX.md and apply it across admin.
- Follow-up (T-0265 review): `ResourceDetailsPage` Details tab panel is unnamed, because PF `PageGroup` drops `aria-label` unless `hasOverflowScroll` is set. Use a `div role="tabpanel"` with an aria-label, as T-0265 does.
