---
id: T-0267
title: CP4.5a UX parity pass — Subject section, Access tab columns, Groups, Effective access (QG-5)
status: todo
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
- [ ] One `ocp-parity.md` row per screen above with verdict `match` or `gap → T-xxxx`.
- [ ] Copy checked verbatim against spec §4.3–§4.5 and §5.
- [ ] Gaps filed as FE tasks with `checkpoint: 4.5a`.

## Work log

## Review

## Handover notes
