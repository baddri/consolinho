import type { LabelSelector, NetworkPolicy } from '@/shared/k8s';

/** The two traffic directions a NetworkPolicy governs, as its `spec.ingress` / `spec.egress` keys. */
export type PolicyDirection = 'ingress' | 'egress';

/**
 * One peer of a rule (`from` / `to` entry), by what it selects: pods (in the policy's namespace, or in the namespaces a
 * `namespaceSelector` picks), every pod of the namespaces a selector picks, or an IP block with its exceptions.
 */
export type PeerView =
  | { kind: 'pods'; podSelector: LabelSelector; namespaceSelector?: LabelSelector }
  | { kind: 'namespaces'; namespaceSelector: LabelSelector }
  | { kind: 'ipBlock'; cidr: string; except: string[] };

/** One ingress or egress rule: its peers (none = any peer) and its ports (none = any port). */
export interface PolicyRuleView {
  peers: PeerView[];
  ports: string[];
}

type Rule = NonNullable<NonNullable<NetworkPolicy['spec']>['ingress']>[number];
type Peer = NonNullable<Rule['from']>[number];
type Port = NonNullable<Rule['ports']>[number];

function peerView(peer: Peer): PeerView {
  if (peer.ipBlock) return { kind: 'ipBlock', cidr: peer.ipBlock.cidr, except: peer.ipBlock.except ?? [] };
  if (peer.podSelector === undefined && peer.namespaceSelector !== undefined) {
    return { kind: 'namespaces', namespaceSelector: peer.namespaceSelector };
  }
  // An empty peer `{}` is invalid in the API; it reads as "any pod" of the policy's namespace.
  return peer.namespaceSelector === undefined
    ? { kind: 'pods', podSelector: peer.podSelector ?? {} }
    : { kind: 'pods', podSelector: peer.podSelector ?? {}, namespaceSelector: peer.namespaceSelector };
}

/**
 * A port as networking-plugin `NetworkPolicyDetailsRowIP` renders it, `protocol/port` (`TCP/8080`), with the API's
 * default protocol TCP filled in, `endPort` as a range (`TCP/32000-32768`), and only the protocol for a rule that
 * names no port (all ports of that protocol).
 */
export function portLabel(port: Port): string {
  const protocol = port.protocol ?? 'TCP';
  if (port.port === undefined) return protocol;
  const range =
    port.endPort === undefined ? String(port.port) : `${String(port.port)}-${String(port.endPort)}`;
  return `${protocol}/${range}`;
}

/** The rules of `direction` with their peers and port labels, in spec order. */
export function policyRules(np: NetworkPolicy, direction: PolicyDirection): PolicyRuleView[] {
  const rules =
    direction === 'ingress'
      ? (np.spec?.ingress ?? []).map((rule) => ({ peers: rule.from, ports: rule.ports }))
      : (np.spec?.egress ?? []).map((rule) => ({ peers: rule.to, ports: rule.ports }));
  return rules.map(({ peers, ports }) => ({
    peers: (peers ?? []).map(peerView),
    ports: (ports ?? []).map(portLabel),
  }));
}

/**
 * Whether the policy governs `direction`, as networking-plugin decides it: listed in `policyTypes`; without
 * `policyTypes`, Ingress always (the API default) and Egress only when `spec.egress` is set.
 */
export function affectsDirection(np: NetworkPolicy, direction: PolicyDirection): boolean {
  const types = np.spec?.policyTypes;
  if (types) return types.includes(direction === 'ingress' ? 'Ingress' : 'Egress');
  return direction === 'ingress' || np.spec?.egress !== undefined;
}

/** A policy that governs `direction` with no rule for it denies all traffic that way. */
export function isDenyAll(np: NetworkPolicy, direction: PolicyDirection): boolean {
  return affectsDirection(np, direction) && (np.spec?.[direction] ?? []).length === 0;
}

/**
 * networking-plugin `consolidatePeers`: the table rows of one rule's peers, one per pod/namespace peer, with every IP
 * block merged into a single row; a rule without peers is one empty row ("Any peer").
 */
export function peerRows(peers: readonly PeerView[]): PeerView[][] {
  if (peers.length === 0) return [[]];
  const ipBlocks = peers.filter((peer) => peer.kind === 'ipBlock');
  const rows = peers.filter((peer) => peer.kind !== 'ipBlock').map((peer) => [peer]);
  return ipBlocks.length > 0 ? [...rows, ipBlocks] : rows;
}
