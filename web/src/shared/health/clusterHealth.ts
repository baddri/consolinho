import type { FleetClusterStatus, FleetClusterVersion } from '@/shared/api';

/**
 * Health of one cluster (CP5 contract §2.1). One implementation for the Fleet overview (FLT-4) and the cluster
 * Overview Status card (OVW-3), which feeds it facts normalised from raw objects (`facts.ts`).
 */
export type ClusterHealthStatus =
  'unreachable' | 'tokenInvalid' | 'degraded' | 'updating' | 'restricted' | 'healthy';

/** Sort rank of each status, worst first (FLT-5 = the §2.1 rule order): sort ascending by it. */
export const HEALTH_SEVERITY: Readonly<Record<ClusterHealthStatus, number>> = {
  unreachable: 0,
  tokenInvalid: 1,
  degraded: 2,
  updating: 3,
  restricted: 4,
  healthy: 5,
};

/** The parts of a fleet status line the health rules read; `facts.ts` builds the same shape from raw objects. */
export type ClusterHealthFacts = Pick<
  FleetClusterStatus,
  'failure' | 'kubernetesVersion' | 'clusterVersion' | 'clusterOperators' | 'nodes'
>;

/** A section the user may not read (403), named as the Restricted tooltip names it. */
export type RestrictedProbe = 'ClusterVersion' | 'ClusterOperators' | 'Nodes' | 'version';

/** Result of {@link clusterHealth}. */
export interface ClusterHealth {
  status: ClusterHealthStatus;
  /** Every forbidden section, in tooltip order — also when a worse status than `restricted` wins. */
  restricted: RestrictedProbe[];
}

/** Failures that make a cluster "Unreachable"; `tokenInvalid` and `blockedByPolicy` have their own rows. */
const UNREACHABLE_FAILURES: ReadonlySet<FleetClusterStatus['failure']> = new Set([
  'unreachable',
  'timeout',
  'tlsError',
  'upstreamError',
]);

/** Whether a nullable count is above zero (null = not probed / not readable = no evidence). */
function positive(count: number | null | undefined): boolean {
  return (count ?? 0) > 0;
}

/** The forbidden sections of `facts`, in the order ClusterVersion, ClusterOperators, Nodes, version. */
function forbiddenSections(facts: ClusterHealthFacts): RestrictedProbe[] {
  const sections: [RestrictedProbe, { outcome: string } | null][] = [
    ['ClusterVersion', facts.clusterVersion],
    ['ClusterOperators', facts.clusterOperators],
    ['Nodes', facts.nodes],
    ['version', facts.kubernetesVersion],
  ];
  return sections.filter(([, section]) => section?.outcome === 'forbidden').map(([name]) => name);
}

/** Applies the §2.1 rule table: the first matching row wins (Unreachable → … → Healthy). */
export function clusterHealth(facts: ClusterHealthFacts): ClusterHealth {
  const restricted = forbiddenSections(facts);
  const { failure, clusterVersion: cv, clusterOperators: co, nodes } = facts;
  const status = ((): ClusterHealthStatus => {
    if (UNREACHABLE_FAILURES.has(failure)) return 'unreachable';
    if (failure === 'tokenInvalid') return 'tokenInvalid';
    if (
      cv?.failing === true ||
      positive(co?.degraded) ||
      positive(co?.unavailable) ||
      positive(nodes?.notReady)
    ) {
      return 'degraded';
    }
    if (cv?.progressing === true) return 'updating';
    if (failure === 'blockedByPolicy' || restricted.length > 0) return 'restricted';
    return 'healthy';
  })();
  return { status, restricted };
}

/** The Update cell (§2.1): what a cluster's update state is; the page maps it to icon + text. */
export type ClusterUpdate =
  | { kind: 'failing' }
  | { kind: 'updating'; version: string | null }
  | { kind: 'available'; count: number }
  | { kind: 'upToDate' };

/**
 * The §2.1 Update cell of a ClusterVersion section: Failing → "Updating to <desired>" → "Update available" →
 * "Up to date" (after OCP `getClusterUpdateStatus`). `undefined` ("—") when there is no readable ClusterVersion.
 */
export function clusterUpdate(cv: FleetClusterVersion | null): ClusterUpdate | undefined {
  if (cv?.outcome !== 'ok') return undefined;
  if (cv.failing === true) return { kind: 'failing' };
  if (cv.progressing === true) return { kind: 'updating', version: cv.desiredVersion };
  if (positive(cv.availableUpdates)) return { kind: 'available', count: cv.availableUpdates ?? 0 };
  return { kind: 'upToDate' };
}

/** The §2.1 Version cell: the OpenShift current version, else the Kubernetes `gitVersion`; `undefined` = "—". */
export function clusterVersionText(facts: ClusterHealthFacts): string | undefined {
  return facts.clusterVersion?.currentVersion ?? facts.kubernetesVersion?.gitVersion ?? undefined;
}
