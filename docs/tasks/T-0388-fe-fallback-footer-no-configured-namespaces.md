---
id: T-0388
title: Fallback selector footer and empty list when no namespaces are configured (NSF-4 copy)
status: todo
owner: frontend-engineer
checkpoint: 5.5
depends_on: [T-0382, T-0383]
paths: [web/src/features/cluster-context/NamespaceSelector.tsx, web/src/features/cluster-context/NamespaceSelector.test.tsx]
review_rounds: 0
---

## Goal
From the T-0387 UX review: in fallback mode with **no** configured namespaces (the NSF-4 "No namespaces available"
landing), the selector menu has an empty list and its footer says "Showing the namespaces configured for your access."
That's wrong, because nothing is shown. Make the copy match what the user sees.

## Scope
- In: footer helper text in fallback mode when `namespaces.length === 0`.
- Out: the listable mode, the empty state page, any layout change.

## Contract / design notes
- `namespaces.length > 0`: keep the NSF-1 text as it is.
- `namespaces.length === 0`: "You can't list namespaces on this cluster. Enter a namespace name." (`${lower}` noun as now).
  The empty `MenuList` stays as it is, because the footer explains it and "Go to …" appears as soon as the user types.

## Context pack
- Touch point: `NamespaceSelector.tsx` `MenuFooter` fallback branch (around L237-243); `namespaces` comes from `useNamespaceFallback`.
- Reproduce in the mock: alice on `dev-k8s-ns` with the `/api/clusters` response patched to `fallbackNamespaces: []`
  (fetch wrapper in a Playwright `addInitScript`; the fixture itself has `["team-a"]`).
- No OCP counterpart (fleet invention). Copy style per UX.md §11.

## Acceptance criteria
- [ ] Footer text depends on whether any namespaces are configured; a test covers both cases.
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
