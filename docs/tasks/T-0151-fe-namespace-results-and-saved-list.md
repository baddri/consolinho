---
id: T-0151
title: Per-namespace rules sections in test results and saved namespaces on credentials
status: todo
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
- [ ] 3 namespaces (one forbidden) ⇒ 3 sections in entry order; the forbidden one shows its error, the others their rules; no generic "test failed" (NST-4).
- [ ] Empty list ⇒ no rules section; incomplete/evaluation-error notes still shown per section.
- [ ] Rotate dialog shows "Inspect namespaces" (`—` when empty); credential rows show the saved list when non-empty (NST-6).
- [ ] Build, lint and tests green (CLAUDE.md rule 4).
- [ ] Probe pages (ux review): test result in the stored-test dialog on `/fleet/admin/clusters/prod-eu-1/credentials`
      with `team-a, forbidden-x, team-b`; credentials tab row with a saved list.

## Work log

## Review

## Handover notes

## Orchestrator reconciliation (2026-11-23)
Backend contract is final in `T-0139` §Contract A/B/C plus `T-0140`/`T-0141`/`T-0142`. Differences from the design brief:
request `distribution` is nullable (`distribution?: ClusterDistribution | null`, missing → field error), responses non-null;
`ConnectionTestStep` gains `distribution` (between `identity` and `openShiftVersion`, 6 steps — needs a label);
`namespaceRules` is always an array of `{namespace, incomplete, evaluationError, rules|null, error|null, failureKind|null}`
(exactly one of rules/error); `AddCredentialRequest` **does** carry optional `inspectNamespaces` (field keys
`inspectNamespaces`, `inspectNamespaces[i]`).
