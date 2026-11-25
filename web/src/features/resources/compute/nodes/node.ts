import type { NodeAddress } from 'kubernetes-types/core/v1';
import { nodeReadiness } from '@/shared/health';
import { formatBinaryBytes, parseQuantity, type Node } from '@/shared/k8s';

/** Node status words of the list's Status cell and filter (OCP `nodeStatus`: Ready or Not Ready only). */
export const NODE_STATUSES = ['Ready', 'Not Ready'] as const;

/** One of {@link NODE_STATUSES}. */
export type NodeStatusText = (typeof NODE_STATUSES)[number];

/** The roles OCP's Roles filter offers (`NodesPage` `nodeRoleFilterOptions`). */
export const NODE_FILTER_ROLES = ['control-plane', 'worker'] as const;

const NODE_ROLE_PREFIX = 'node-role.kubernetes.io/';
const MACHINE_ANNOTATION = 'machine.openshift.io/machine';

/**
 * Ready / Not Ready from the `Ready` condition (`shared/health:nodeReadiness`). As OCP `nodeStatus`, anything but
 * Ready=True (False, Unknown, missing) is "Not Ready".
 */
export function nodeStatusText(node: Node): NodeStatusText {
  return nodeReadiness(node) === 'Ready' ? 'Ready' : 'Not Ready';
}

/** The node's roles from its `node-role.kubernetes.io/<role>` labels, sorted (OCP `getNodeRoles` + `NodeRoles`). */
export function nodeRoles(node: Node): string[] {
  return Object.keys(node.metadata?.labels ?? {})
    .filter((key) => key.startsWith(NODE_ROLE_PREFIX))
    .map((key) => key.slice(NODE_ROLE_PREFIX.length))
    .sort();
}

/** Instance type label (`node.kubernetes.io/instance-type`, falling back to the deprecated `beta.` label). */
export function nodeInstanceType(node: Node): string | undefined {
  const labels = node.metadata?.labels;
  return labels?.['node.kubernetes.io/instance-type'] ?? labels?.['beta.kubernetes.io/instance-type'];
}

/** Zone label (`topology.kubernetes.io/zone`). */
export function nodeZone(node: Node): string | undefined {
  return node.metadata?.labels?.['topology.kubernetes.io/zone'];
}

/** CPU architecture as the kubelet reports it, else the `kubernetes.io/arch` label. */
export function nodeArchitecture(node: Node): string | undefined {
  return node.status?.nodeInfo?.architecture ?? node.metadata?.labels?.['kubernetes.io/arch'];
}

/**
 * The Machine behind the node from the `machine.openshift.io/machine` annotation (`<namespace>/<name>`, OCP
 * `getNodeMachineNameAndNamespace`); `undefined` when not annotated (non-OpenShift clusters, bare-metal UPI).
 */
export function nodeMachine(node: Node): { name: string; namespace: string } | undefined {
  const [namespace = '', name = ''] = (node.metadata?.annotations?.[MACHINE_ANNOTATION] ?? '').split('/');
  return name && namespace ? { name, namespace } : undefined;
}

/**
 * The cloud provider from `spec.providerID` (`aws:///…` → "Amazon Web Services"), as OCP's Provider ID row
 * (`cloudProviderID` + `cloudProviderNames`); `undefined` without a provider ID.
 */
export function nodeProvider(node: Node): string | undefined {
  const provider = node.spec?.providerID?.split('://')[0];
  return provider ? provider.replace(/aws/i, 'Amazon Web Services') : undefined;
}

/**
 * When the node last became Ready (the `Ready` condition's `lastTransitionTime` while True), OCP's Uptime row
 * (`getNodeUptime`); `undefined` while the node is not Ready.
 */
export function nodeUptime(node: Node): string | undefined {
  return node.status?.conditions?.find((c) => c.type === 'Ready' && c.status === 'True')?.lastTransitionTime;
}

/** Addresses sorted by type with a readable type (`InternalIP` → "Internal IP"), as OCP `NodeIPList` (expanded). */
export function nodeAddresses(node: Node): { type: string; address: string }[] {
  return (node.status?.addresses ?? [])
    .filter((entry: NodeAddress) => entry.address)
    .sort((a, b) => a.type.localeCompare(b.type))
    .map(({ type, address }) => ({ type: type.replace(/([a-z])([A-Z])/g, '$1 $2'), address }));
}

/** `n` CPU cores as text: `8 cores`, `7.5 cores`, `1 core`. */
function formatCores(cores: number): string {
  const text = new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(cores);
  return `${text} ${cores === 1 ? 'core' : 'cores'}`;
}

/** One row of the Capacity and allocatable table. */
export interface NodeResourceRow {
  resource: string;
  capacity: string | undefined;
  allocatable: string | undefined;
}

const RESOURCE_ROWS: { label: string; key: string; format: (quantity: string) => string }[] = [
  { label: 'CPU', key: 'cpu', format: (q) => withParsed(q, formatCores) },
  { label: 'Memory', key: 'memory', format: (q) => withParsed(q, formatBinaryBytes) },
  { label: 'Ephemeral storage', key: 'ephemeral-storage', format: (q) => withParsed(q, formatBinaryBytes) },
  { label: 'Pods', key: 'pods', format: (q) => q },
];

/** `quantity` formatted by `format`, or as written when it doesn't parse. */
function withParsed(quantity: string, format: (value: number) => string): string {
  const value = parseQuantity(quantity);
  return value === undefined ? quantity : format(value);
}

/** CPU, Memory, Ephemeral storage and Pods of `status.capacity` / `status.allocatable`, humanised (NODE-3). */
export function nodeResourceRows(node: Node): NodeResourceRow[] {
  const { capacity = {}, allocatable = {} } = node.status ?? {};
  return RESOURCE_ROWS.map(({ label, key, format }) => {
    const cap = capacity[key];
    const alloc = allocatable[key];
    return {
      resource: label,
      capacity: cap === undefined ? undefined : format(cap),
      allocatable: alloc === undefined ? undefined : format(alloc),
    };
  });
}
