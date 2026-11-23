import { useActiveCluster } from '@/features/cluster-context';
import { DaemonSetModel, type DaemonSet, type K8sResource } from '@/shared/k8s';
import { DetailsItem, DetailsSubsection } from '@/shared/ui';
import { ContainersTable } from '../../components/ContainersTable';
import { PodRing } from '../../components/PodRing';
import { VolumesTable } from '../../components/VolumesTable';
import type { KindActionArgs, KindActions, ResourceStatus } from '../../registry/types';
import { useRestartAction } from '../scale/useRestartRollout';

/** A listed DaemonSet (`metadata` always present). */
export type DaemonSetResource = DaemonSet & K8sResource;

/** Nodes running a daemon pod (`status.currentNumberScheduled`). */
export function daemonSetCurrent(daemonSet: DaemonSet): number {
  return daemonSet.status?.currentNumberScheduled ?? 0;
}

/** Nodes that should run a daemon pod (`status.desiredNumberScheduled`). */
export function daemonSetDesired(daemonSet: DaemonSet): number {
  return daemonSet.status?.desiredNumberScheduled ?? 0;
}

/**
 * "`currentNumberScheduled` of `desiredNumberScheduled` pods", as OCP's workload Status column (`workload-table.tsx`
 * `ReplicasCount` DaemonSet branch).
 */
export function daemonSetStatus(daemonSet: DaemonSet): ResourceStatus {
  return { title: `${String(daemonSetCurrent(daemonSet))} of ${String(daemonSetDesired(daemonSet))} pods` };
}

/**
 * Above the grid, OCP `DaemonSetDetails`: the read-only ring (`enableScaling={false}`). OCP's DaemonSet ring label
 * counts scheduled pods over the desired number, so the DaemonSet is shown to the ring as that replica pair.
 */
export function DaemonSetDetailsTop({ obj }: { obj: DaemonSetResource }) {
  const cluster = useActiveCluster();
  if (cluster === undefined) return null;
  const workload = {
    metadata: obj.metadata,
    spec: { replicas: daemonSetDesired(obj) },
    status: { readyReplicas: daemonSetCurrent(obj) },
  };
  return <PodRing cluster={cluster} workload={workload} selector={obj.spec?.selector.matchLabels} />;
}

/** Right column, OCP `DaemonSetDetailsList`: Current count, Desired count. */
export function DaemonSetDetailsList({ obj }: { obj: DaemonSetResource }) {
  return (
    <>
      <DetailsItem label="Current count">{daemonSetCurrent(obj)}</DetailsItem>
      <DetailsItem label="Desired count">{daemonSetDesired(obj)}</DetailsItem>
    </>
  );
}

/** Sections below the grid (OCP `DaemonSetDetails`): Containers, Volumes. */
export function DaemonSetSections({ obj }: { obj: DaemonSetResource }) {
  const podSpec = obj.spec?.template.spec;
  return (
    <>
      <DetailsSubsection title="Containers">
        <ContainersTable containers={podSpec?.containers ?? []} />
      </DetailsSubsection>
      <DetailsSubsection title="Volumes">
        <VolumesTable spec={podSpec} namespace={obj.metadata.namespace} />
      </DetailsSubsection>
    </>
  );
}

/**
 * The DaemonSet's own action (ADR-0037 §3): "Restart rollout" (`patch daemonsets`; a fleet addition per spec WL-4 —
 * OCP's `daemon-set-provider.ts` has none). No count item: a DaemonSet runs one pod per eligible node. The common
 * Edit / Delete items follow it.
 */
export function useDaemonSetActions(args: KindActionArgs<DaemonSetResource>): KindActions {
  return { items: [useRestartAction(args, DaemonSetModel)], dialog: null };
}
