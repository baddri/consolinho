---
id: T-0151
title: Per-namespace rules sections in test results and saved namespaces on credentials
status: done
owner: frontend-engineer
checkpoint: 3.7
depends_on: [T-0146]
paths: [web/src/features/admin/connection-test/ConnectionTestResultView.tsx, web/src/features/admin/connection-test/NamespaceRulesTable.tsx, web/src/features/admin/connection-test/ConnectionTestResultView.test.tsx, web/src/features/admin/credentials]
review_rounds: 0
---

## Goal
NST-4 and NST-6 (display): the test result shows one expandable section per inspected namespace (rules table or
why it failed), and admins can see which namespaces a credential will be tested against.

## Scope
- In: result view sections (replaces T-0146's bridge), credential row display, rotate dialog facts, tests.
- Out: the input (T-0150). If T-0150 is in flight, coordinate edits to `TestConnection.test.tsx` (shared file).

## Contract / design notes
- `ConnectionTestResultView`: for each `namespaceRules` entry, **in the order returned** (= order entered):
  `ExpandableSection toggleText="Rules in namespace <ns>"` (collapsed); content = `NamespaceRulesTable` for a rules
  entry (incomplete/evaluation-error notes as today, NST-4) or `Alert variant="warning" isInline isPlain title=<error>`
  for an error entry. No section when the array is empty (spec §5). The overall step/headline ("Rules reviewed in 2 of
  3 namespaces") comes from the server's steps — don't compute it. Section key = namespace.
  If there are > 1 entries, group them under `Title h3 size="md"` "Namespace rules" like the "Capabilities" heading (L75-81).
- `NamespaceRulesTable` prop type → the generated rules-entry type (alias from T-0146); keep its table.
- Saved list display (NST-6): credentials have no details page, so
  - `RotateCredentialModal` "Credential to rotate" `DescriptionList` (L140-146) gets "Inspect namespaces": comma list, `—` when empty;
  - `CredentialRow` Name cell: a secondary line like `CredentialDescription` — "Inspect namespaces: team-a, team-b",
    omitted when empty (a `—` on every row is noise). ux-designer confirms this placement in review.
  Shared formatter `formatInspectNamespaces(list): string` (`—` when empty) in `credentials/credentialText.ts`.

## Context pack
- Docs: spec NST-4/6, §5 "Empty/error states"; `UX.md` §6 (details), §9 (modals).
- Exemplars: `connection-test/ConnectionTestResultView.tsx:ConnectionTestResultView` L59-94 (sections, capabilities heading);
  `connection-test/NamespaceRulesTable.tsx:NamespaceRulesTable` L18-40; `credentials/CredentialDescription.tsx` (+ `.module.css`, secondary line).
- Touch points: `credentials/CredentialRow.tsx:CredentialRow` L23-32 (Name cell); `credentials/RotateCredentialModal.tsx` L140-146;
  `credentials/credentialText.ts`; tests `ConnectionTestResultView.test.tsx`, `ClusterCredentialsTab.test.tsx`;
  MSW error entry for names starting `forbidden` (T-0146).
- OCP reference: none (connection testing is a Fleet invention). Keep our existing PF `ExpandableSection` pattern
  (`UX.md` §6). For the saved-list secondary line, follow how OCP shows facts under a name, e.g. `/home/bad/works/openshift-console/frontend/public/components/utils/details-item.tsx:DetailsItem`.

## Acceptance criteria
- [x] 3 namespaces (one forbidden) ⇒ 3 sections in entry order; the forbidden one shows its error, the others their rules; no generic "test failed" (NST-4).
- [x] Empty list ⇒ no rules section; incomplete/evaluation-error notes still shown per section.
- [x] Rotate dialog shows "Inspect namespaces" (`—` when empty); credential rows show the saved list when non-empty (NST-6).
- [x] Build, lint and tests green (CLAUDE.md rule 4).
- [x] Probe pages (ux review): test result in the stored-test dialog on `/fleet/admin/clusters/prod-eu-1/credentials`
      with `team-a, forbidden-x, team-b`; credentials tab row with a saved list.

## Work log
- 2026-11-23 frontend-engineer: started; ff-merged cp/3.7-fleet-foundations (1894c32).
- 2026-11-23: `NamespaceRulesSections` (collapsed section per entry, error entry = plain warning Alert inside its section,
  "Namespace rules" h3 when >1); `formatInspectNamespaces`; row secondary line + rotate fact. Fixture: staging-eu-1
  fleet-admin now has saved `team-a, team-b` (prod-eu-1 fleet-edit would break T-0150's prefill tests). Gate green; probe
  on staging credentials row: subtle 14px/21px like the description (wraps to 2 lines in the narrow Name column).
- 2026-11-23 fix round 1: failed-namespace toggle uses `toggleContent` (warning `Icon` + ": could not be reviewed"),
  tested via text and accessible name; row namespaces line reuses `CredentialDescription` (2-line clamp + title). Gate green.

## Review
- 2026-11-23 ux-designer, round 1: **CHANGES_REQUESTED** (mock UI :5241, 1280 light; staging-eu-1 fleet-admin, test with team-a, forbidden-x, team-b).
  - Result, collapsed — the forbidden-x section looks the same as the healthy ones (same 14px link-blue toggle, no icon). The only clue is the step "rules reviewed in 2 of 3 namespaces", which doesn't say which namespace failed. — OCP `packages/console-app/src/components/nodes/status/SchedulableStatus.tsx` (`toggleContent={<StatusIconAndText icon={<YellowExclamationTriangleIcon/>} title=…/>}`) and `packages/vsphere-plugin/src/components/VSphereOperatorStatuses.tsx` (status icon in the toggle while collapsed). — Fix: for an error entry use `toggleContent` with the warning icon (PF `ExclamationTriangleIcon`, `--pf-t--global--icon--color--status--warning--default`) plus the text "Rules in namespace forbidden-x: could not be reviewed". Keep the plain Alert with the server message inside. Add a test that the toggle carries the status text.
  - Credentials row — at 1280 the Name column is 137px, so "Inspect namespaces: team-a, team-b" wraps to 3 lines (63px). With 10 namespaces it would grow without limit and dominate the row. — OCP `.co-line-clamp` (`public/style/_common.scss`), already used by `CredentialDescription.module.css`. — Fix: clamp the line to 2 lines with `title` holding the full list (reuse the description's clamp class). The placement under the name is confirmed.
  - OK: there are 3 sections in entry order. The "Namespace rules" h3 is 16px/600, the same Title as "Capabilities". The expanded error shows the plain warning Alert and there is no generic failure. Tables are unchanged. The rotate dialog shows "Inspect namespaces" with "team-a, team-b" and "—" when empty (prod-eu-1 fleet-view).
- 2026-11-23 frontend-architect, round 1: **CHANGES_REQUESTED** (gate green: lint/typecheck/884 tests/build).
  - `connection-test/ConnectionTestResultView.tsx:111` — an error entry's section looks exactly like a reviewed one while
    collapsed, so the admin cannot tell *which* namespace failed without opening each (a regression from T-0146, where
    the error was visible). NST-4 asks for "its error" per section; the design's "collapsed" was mine and too strict. Fix:
    for `entry.error !== null` use `toggleContent` = `Rules in namespace <ns>` + a status icon
    (`<Icon status="warning"><ExclamationTriangleIcon /></Icon>`, as in `TestStepList`) with accessible text, e.g. visible
    suffix "· could not be reviewed" (keeps the `/^Rules in namespace /` name); content stays the plain Alert. Reviewed
    entries unchanged. Test: assert the forbidden toggle's name/text conveys the failure while collapsed.
  - Mock (b): staging-eu-1 fleet-admin carrying `team-a, team-b` is fine — keeps T-0150's prod-eu-1 prefill tests intact,
    the fixture doc says so, and the empty case stays covered by prod-eu-1 fleet-view. No change.
  - Nit (optional): `CredentialRow.tsx:35` inline `div.SUBTLE` vs `CredentialDescription`'s module — fine; ux-designer
    to confirm the 2-line wrap in the Name column.
- 2026-11-23 ux-designer, round 2: **APPROVE** (mock :5243, 1280 light; this also closes the architect's finding #1).
  - #1 fixed: while collapsed, the forbidden-x toggle reads "Rules in namespace forbidden-x: could not be reviewed" and shows a yellow warning icon before the text. The other two toggles are unchanged (OCP `SchedulableStatus.tsx` pattern).
  - #2 fixed: the row line goes through `CredentialDescription` and is clamped to 42px (2 lines of 21px). Its `title` holds the full text "Inspect namespaces: team-a, team-b". No regressions in the 3 sections.

## Handover notes
- Result view: `ConnectionTestResultView.tsx:NamespaceRulesSections`; the error entry's message is now the Alert *title*
  (spec'd), inside the collapsed section, so it is hidden until expanded. No headline computed client-side.
- `NamespaceRulesTable` prop type already was the generated alias; unchanged.
- Saved list: `credentialText.ts:formatInspectNamespaces`; `CredentialRow` subtle line (omitted when empty);
  `RotateCredentialModal` "Inspect namespaces" fact (`—` when empty).
- Mock: the saved list lives on staging-eu-1 fleet-admin (`jwtCredential` takes optional `inspectNamespaces`).
- Probe: the test-result dialog needs typing (the probe never clicks), so ux review must verify it by hand or with tests.
  Tests: `ConnectionTestResultView.test.tsx` (NST-4 x2), `ClusterCredentialsTab.test.tsx` (NST-6 + dash in CRED-5/2).

## Orchestrator reconciliation (2026-11-23)
Backend contract is final in `T-0139` §Contract A/B/C plus `T-0140`/`T-0141`/`T-0142`. Differences from the design brief:
request `distribution` is nullable (`distribution?: ClusterDistribution | null`, missing → field error), responses non-null;
`ConnectionTestStep` gains `distribution` (between `identity` and `openShiftVersion`, 6 steps — needs a label);
`namespaceRules` is always an array of `{namespace, incomplete, evaluationError, rules|null, error|null, failureKind|null}`
(exactly one of rules/error); `AddCredentialRequest` **does** carry optional `inspectNamespaces` (field keys
`inspectNamespaces`, `inspectNamespaces[i]`).
