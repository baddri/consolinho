---
id: T-0305
title: NetworkPolicies — list and details with Ingress/Egress rules (NP-1, NP-2)
status: todo
owner: frontend-engineer
checkpoint: 5a
depends_on: [T-0300]
paths: [web/src/features/resources/registry/kinds/networkpolicies.tsx, web/src/features/resources/networking/networkpolicies]
review_rounds: 0
---

## Goal
NetworkPolicies are readable without YAML: which pods they target and, rule by rule, who may talk to them and on
which ports — the question Marco asks when an app can't reach its database.

## Scope
- In: list columns, details right column, "Ingress rules" / "Egress rules" sections, pure rule model + tests.
- Out: NetworkPolicy form, MultiNetworkPolicy (NP-3).

## Contract / design notes
- **List** (*(np)* `networkpolicies/list/NetworkPolicyList.tsx` + `hooks/`): Name, Namespace, Pod selector
  (`PodSelectorLink` with `spec.podSelector`; empty selector reads "All pods" — check np copy), Created.
- **Pure model** `networking/networkpolicies/policyRules.ts`: `policyRules(np, 'ingress' | 'egress')` →
  `{ peers: PeerView[]; ports: string[] }[]` where `PeerView` = `{ kind: 'pods'; podSelector; namespaceSelector? } |
  { kind: 'namespaces'; namespaceSelector } | { kind: 'ipBlock'; cidr; except: string[] }`; ports as `port/protocol`
  (protocol default TCP, `endPort` → `port-endPort/protocol`); `isDenyAll(np, direction)` = direction in `policyTypes`
  (Ingress implied when `policyTypes` absent) and no rules. **Unit tests** (QG5A-1): each peer shape, empty selectors,
  ports incl. named port and endPort, deny-all both directions, policyTypes absent.
- **Details** (*(np)* `tabs/details/NetworkPolicyDetails.tsx` + `components/`): right column Pod selector, Policy
  types; `DetailsSubsection` "Ingress rules" / "Egress rules" each a compact `Table` as OCP: Target pods · From (To) ·
  To (From) ports — copy column titles, the "All pods" / "All namespaces" / IP block "except" rendering and the
  deny-all sentence **verbatim from np source** (spec NP-2 says verify wording; record the final strings in the Work log).
  Pod selectors → `PodSelectorLink` (namespace = policy's, or "any namespace" when a namespaceSelector is present —
  as OCP); namespace selectors as label text (no Namespace search link unless OCP has one).

## Context pack
- Exemplars: `registry/columns.tsx:PodSelectorLink` (L102); `registry/kinds/services.tsx:PortsTable`.
- Touch points: `registry/kinds/networkpolicies.tsx:networkPolicyDescriptor` (minimal, T-0300).
- OCP reference: *(np)* `src/views/networkpolicies/list/NetworkPolicyList.tsx`, `…/list/hooks/`,
  `src/views/networkpolicies/details/tabs/details/NetworkPolicyDetails.tsx` + `components/` + `utils/`
  (`gh api repos/openshift/networking-console-plugin/contents/<path>`).

## Acceptance criteria
- [ ] NP-1: list columns as OCP; `deny-all-ingress` pod selector reads OCP's "all pods" copy.
- [ ] NP-2: `allow-web-from-router` ingress table shows namespace+pod selector peer and `8080/TCP`; `db-egress` egress table shows IP block with except and `5432/TCP`; `deny-all-ingress` shows the deny-all sentence.
- [ ] `policyRules` / `isDenyAll` unit tests (QG5A-1).
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
