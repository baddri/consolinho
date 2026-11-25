---
id: T-0367
title: Link OLM related resources (InstallPlan, CatalogSource, OperatorGroup, ServiceAccount) from CSV pages
status: todo
owner: frontend-engineer
checkpoint: backlog
depends_on: [T-0337]
paths: [web/src/features/resources/registry/kinds, web/src/features/resources/operators, web/src/mocks/k8s]
review_rounds: 0
---

## Goal
T-0337 renders OperatorGroup, Operator ServiceAccounts, CatalogSource and InstallPlan as badged plain text because those
kinds are not registered. OCP renders them as `ResourceLink`s. Register read-only descriptors so the names become links.

## Scope
- In: read-only descriptors (list + details + YAML) for ServiceAccount, OperatorGroup, CatalogSource and InstallPlan,
  following the existing read-only kinds (`kinds/clusteroperators.tsx`). Switch the CSV badged names to the engine's
  resource link.
- Out: OperatorHub, InstallPlan approval, Subscription editing, any mutating action.

## Contract / design notes
- Links: `operators/CsvDetails.tsx` L204-213 (ServiceAccounts, OperatorGroup) and the CatalogSource/InstallPlan cells
  in `operators/CsvSubscriptionTab.tsx`.
- Nav: OCP shows none of these in the Operators nav except ServiceAccounts under User Management; no new nav items
  unless the parity map (`docs/architecture/ocp-parity.md`) lists them.
- MSW fixtures: add matching objects to `mocks/k8s/clusterFixtures.ts` so the links resolve in dev.

## Context pack
- Exemplar descriptor: `web/src/features/resources/registry/kinds/clusteroperators.tsx` (read-only kind).
- Plain-text sites: `operators/CsvDetails.tsx:204-213`, `operators/CsvSubscriptionTab.tsx` (CatalogSource/InstallPlan).
- OCP reference: `/home/bad/works/openshift-console/frontend/packages/operator-lifecycle-manager/src/components/subscription.tsx`
  (L201, L298, L317 `ResourceLink`), `clusterserviceversion.tsx` (OperatorGroup and ServiceAccount links),
  `install-plan.tsx`, `catalog-source.tsx`, `operator-group.tsx`.

## Acceptance criteria
- [ ] The four kinds have read-only list, details and YAML pages.
- [ ] CSV Details and Subscription tab show links instead of badged plain text.
- [ ] Tests for the descriptors and the links; build, lint and tests green (CLAUDE.md rule 4).

## Work log

## Review

## Handover notes
