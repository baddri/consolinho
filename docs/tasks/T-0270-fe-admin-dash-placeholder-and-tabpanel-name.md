---
id: T-0270
title: Use OCP's "-" empty placeholder across admin; name the resource Details tab panel
status: done
owner: frontend-engineer
checkpoint: 4.5a
depends_on: [T-0267]
paths: [web/src/features/admin, web/src/features/resources, web/src/shared/ui]
review_rounds: 0
---

## Goal
Two follow-ups collected by T-0263/T-0265 reviews and settled in T-0267: one empty-value placeholder everywhere, and an
accessible name on the resource Details tab panel.

## Scope
- In: (1) the placeholder sweep; (2) the Details tab panel name.
- Out: any other copy change.

## Contract / design notes
1. Effective access tab, user/cluster details and several admin cells — empty values show `—` (em dash, e.g. the
   candidates table Priority for user grants, "Groups —" for a user without groups) while lists and OCP show `-` —
   OCP `packages/console-shared/src/constants/ui.ts` `DASH = '-'` (139 uses under `public/components`, no em dash) —
   one shared `DASH` constant in `web/src/shared` (today `features/admin/groups/GroupHostLabels.tsx:DASH` and
   `features/admin/effective-access/effectiveAccessText.ts:EMPTY = '—'` both exist), used for every empty value. UX.md §11 now states the rule.
   Files with `—` today: `admin/credentials/{ServiceAccountCell.tsx,credentialText.ts}`, `admin/clusters/ClusterDetailsTab.tsx`,
   `admin/audit/AuditEntryRow.tsx`, `admin/connection-test/NamespaceRulesTable.tsx`, `admin/users/{UserDetailsTab.tsx,userColumns.tsx}`,
   `admin/effective-access/{EffectiveAccessTab.tsx,effectiveAccessText.ts}`, `resources/registry/{columns.tsx,kinds/NamespaceDetails.tsx,kinds/services.tsx}`,
   `resources/components/{ObjectReferenceLink.tsx,ResourceStatusLabel.tsx}`, `resources/workloads/replicationcontrollers/replicationControllerDetails.tsx`,
   `shared/ui/{RelativeTime.tsx,Status.tsx}`. Check each: only empty-value placeholders change; an em dash used as
   punctuation inside a sentence stays.
2. Resource details (`/c/:c/k8s/...`, Details tab) — `ResourceDetailsPage.tsx` L228 passes `role="tabpanel"` and
   `aria-label` to PF `PageGroup`, which drops `aria-label` unless `hasOverflowScroll` is set, so the panel is unnamed —
   (a11y, UX.md §12) — use a `div role="tabpanel" aria-label=…` wrapper as the YAML/other tabs at L237/L246 and the admin details pages (T-0265) do.

## Context pack
- Touch points: listed above; tests asserting `—` need updating (`grep -rn "'—'" web/src --include=*.test.tsx`).
- OCP reference: `packages/console-shared/src/constants/ui.ts:DASH`.

## Acceptance criteria
- [x] `grep -rn "'—'" web/src --include=*.ts --include=*.tsx | grep -v test` returns no empty-value placeholder.
- [x] The resource Details tab panel has an accessible name (RTL `getByRole('tabpanel', { name: 'Details' })`).
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-24 frontend-engineer: new `shared/ui/dash.ts:DASH` ('-', exported from `@/shared/ui`); replaced every
  empty-value `—` in the listed files and the local `EMPTY`/`DASH` constants (GrantRow, GroupHostLabels,
  effectiveAccessText, ClusterDetailsTab, UserDetailsTab, userColumns); punctuation em dashes untouched. Resource
  Details tab panel is a `div role=tabpanel`; test added. Tests asserting `—` updated.

## Review
- 2026-11-24 ux-designer, round 1: **APPROVE**.
  - 1 `shared/ui/dash.ts:DASH = '-'` matches OCP `console-shared/src/constants/ui.ts:DASH`; the remaining `—` under web/src (non-test, non-comment) are all sentence punctuation (proxyOutcome, AuditLogPage subtitle, ClusterSwitcher, LiveIndicator, UserStatusLabel tooltip, …). Group Users table renders `-` for empty cells (seen in mock). OK.
  - 2 Resource Details tab panel is a named `div role=tabpanel` (test `ResourceDetailsPage.test.tsx` L242); group Details tab does the same. OK.

## Handover notes
- Existing `'-'` literals in resources (ContainersTable, ConditionsTable, PodDetails, cronjobs, MetricsTable, Timestamp,
  …) already render OCP's `-` and were left as literals (outside this task's file list); switching them to `DASH` is
  an optional mechanical follow-up.
- Doc comments that described the placeholder as "—" now say "-".
