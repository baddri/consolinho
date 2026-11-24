---
id: T-0305
title: NetworkPolicies — list and details with Ingress/Egress rules (NP-1, NP-2)
status: done
owner: frontend-engineer
checkpoint: 5a
depends_on: [T-0300]
paths: [web/src/features/resources/registry/kinds/networkpolicies.tsx, web/src/features/resources/networking/networkpolicies]
review_rounds: 1
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
  { kind: 'namespaces'; namespaceSelector } | { kind: 'ipBlock'; cidr; except: string[] }`; ports as `protocol/port` (np order)
  (protocol default TCP, `endPort` → `protocol/port-endPort`); `isDenyAll(np, direction)` = direction in `policyTypes`
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
- [x] NP-1: list columns as OCP; `deny-all-ingress` pod selector reads OCP's "all pods" copy.
- [x] NP-2: `allow-web-from-router` ingress table shows namespace+pod selector peer and `TCP/8080`; `db-egress` egress table shows IP block with except and `TCP/5432`; `deny-all-ingress` shows the deny-all sentence.
- [x] `policyRules` / `isDenyAll` unit tests (QG5A-1).
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-25 frontend-engineer: started; read np `useNetworkPolicyColumn`, `NetworkPolicyRow`, details Ingress/Egress/Row* + `consolidatePeers`.
- 2026-11-25: list = Name, Namespace, Pod selector (≥ md), no Created (np has none); empty selector "All pods within <ns>" → Search Pods in ns.
- 2026-11-25: np strings: "Target pods/From/To ports", "From pods/To/To ports", "Any peer", "NS selector", "Any namespace", "Any pod", "IP blocks", "(with exceptions)" + tooltip "Exceptions: a, b", "Any port", "All incoming traffic is denied to Pods in <ns>", "All outgoing traffic is denied from Pods in <ns>".
- 2026-11-25: ports render `TCP/8080` (np `${protocol}/${port}`), not the contract's `8080/TCP`; endPort `TCP/a-b`. Right column (Pod selector, Policy types) per contract, np has none.
- 2026-11-25: in_review; list probe vs OCP shows only shared DataView diffs; details not probed (no NP on the reference cluster route known).
- 2026-11-25: UX round 1 fixes: UX-1 peer pod selector under an NS selector → `AllNamespacesSelectorLink` (search icon, Search Pods all namespaces); UX-2 rule tables `Th width` 35/35/30.

## Review
- Round 1 (frontend-architect, 2026-11-25): **APPROVE**. `scripts/check-fe.sh src/features/resources/networking` green (53 tests).
- Port order `TCP/8080`: matches np `NetworkPolicyDetailsRowIP`; spec NP-2 and this task's contract/AC reworded to `protocol/port`.
- No Created column: correct, np `useNetworkPolicyColumn` has none. Right column (Pod selector, Policy types): spec NP-2 asks for it; accepted.
- "Any peer" / "Any port": both are np strings (`NetworkPolicyDetailsRowSelector`, `…RowIP`); the fallbacks are reasonable for empty `from`/`ports`.
- Peer pod selector under a namespaceSelector as plain text: accepted (np links to all-namespaces Search); optional follow-up.
- Docs link: `NETWORK_POLICY_DOCS_URL` is a fixed constant, no user data in the href. OK.
- Nit (optional): `NetworkPolicyDetails.tsx` ports `<p key={port}>` would give duplicate keys if a rule repeats a port; key by index.
- Round 1 (ux-designer, 2026-11-25): **CHANGES_REQUESTED**. Mock UI 1280 light; probe + clipped shots of allow-web-from-router, db-egress, deny-all-ingress; reference = np source (no NP plugin on the ref console).
- UX-1 allow-web-from-router Ingress "From" — peer pod selector under an NS selector is plain black text right under a blue Search link, so the cell reads inconsistently — np `NetworkPolicyDetailsRowSelector` renders `<Selector namespace={undefined}>` = search icon + link to all-namespaces Search for Pods — render it like `NamespaceSelectorLink` (Search all-namespaces, `kinds: [PodModel]`, labels), plain text only outside a cluster.
- UX-2 Ingress/Egress tables — columns auto-size (Target pods 136px of 894, ports pushed far right) and the two stacked sections don't align — np header is `<Grid>` of three `GridItem span={4}` (equal thirds) — set `Th width` 35 / 35 / 30 (nearest PF modifiers) in `RulesSection` so both tables share column positions.
- OK: copy verbatim vs np (titles, captions "Pod selector"/"NS selector"/"Namespace"/"IP blocks", "(with exceptions)" + "Exceptions: …" tooltip, deny-all sentences, `TCP/8080`); info icon = status-info colour as np `BlueInfoCircleIcon` (`--pf-t--global--icon--color--status--info--default`); compact table matches Services ports / Route traffic siblings; header-only Egress table on Ingress-only policies is np parity; "Any peer"/"Any port" accepted (k8s semantics: empty = all).
- For T-0310 (shared list, not this task): engineer's list probe showed only shared DataView padding/width/row-height diffs vs OCP; audit them there.

## Handover notes
- Model: `networking/networkpolicies/policyRules.ts` (`policyRules`, `isDenyAll`, `affectsDirection`, `peerRows` = np `consolidatePeers`, `portLabel`).
- UI: `NetworkPolicyDetails.tsx` (right column + `NetworkPolicySections`), `PolicySelectors.tsx` ("All pods within", namespace and cross-namespace pod selectors → `AllNamespacesSelectorLink`, Search all namespaces).
- As np: Ingress section hidden when Ingress isn't governed; Egress section always shown (empty table when no egress rules and not governed).
- Deviations: port order `TCP/8080` (OCP) vs AC text `8080/TCP`; empty `from: []` reads "Any peer" (np renders no row); empty ports read "Any port" (np renders nothing).
- Peer pod selector under a namespaceSelector links to all-namespaces Search for Pods (`AllNamespacesSelectorLink`, as np `Selector`); docs link uses the OKD upstream URL.
