import { useActiveCluster } from '@/features/cluster-context';
import { StatefulSetModel, type K8sResource, type StatefulSet } from '@/shared/k8s';
import { DetailsSubsection } from '@/shared/ui';
import { ContainersTable } from '../../components/ContainersTable';
import { VolumesTable } from '../../components/VolumesTable';
import type { KindActionArgs, KindActions, ResourceStatus } from '../../registry/types';
import { useEditCountAction } from '../scale/useEditCountAction';
import { useRestartAction } from '../scale/useRestartRollout';
import { WorkloadPodRing } from '../scale/WorkloadPodRing';

/** A listed StatefulSet (`metadata` always present). */
export type StatefulSetResource = StatefulSet & K8sResource;

/** Desired replicas; the API server defaults an omitted `spec.replicas` to 1. */
export function statefulSetDesired(statefulSet: StatefulSet): number {
  return statefulSet.spec?.replicas ?? 1;
}

/** Current replicas (`status.replicas`), the first number of OCP's "N of M pods". */
export function statefulSetCurrent(statefulSet: StatefulSet): number {
  return statefulSet.status?.replicas ?? 0;
}

/** "`status.replicas` of `spec.replicas` pods", as OCP's workload Status column (`workload-table.tsx` `ReplicasCount`). */
export function statefulSetStatus(statefulSet: StatefulSet): ResourceStatus {
  return {
    title: `${String(statefulSetCurrent(statefulSet))} of ${String(statefulSetDesired(statefulSet))} pods`,
  };
}

/** Above the grid, as OCP `StatefulSetDetails` `PodRingSet`: the ring of live pods with scale arrows. */
export function StatefulSetDetailsTop({ obj }: { obj: StatefulSetResource }) {
  const cluster = useActiveCluster();
  if (cluster === undefined) return null;
  return <WorkloadPodRing cluster={cluster} model={StatefulSetModel} obj={obj} />;
}

/** Sections below the grid (OCP `StatefulSetDetails`): Containers, Volumes. */
export function StatefulSetSections({ obj }: { obj: StatefulSetResource }) {
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
 * The StatefulSet's own actions (ADR-0037 §3, OCP `stateful-set-provider.ts`): "Edit Pod count" (`patch
 * statefulsets/scale`; hidden under an HPA) and "Restart rollout" (`patch statefulsets`; a fleet addition per spec
 * WL-3 — OCP's provider has none). The common Edit / Delete items follow them.
 */
export function useStatefulSetActions(args: KindActionArgs<StatefulSetResource>): KindActions {
  const editCount = useEditCountAction(args, StatefulSetModel);
  const restart = useRestartAction(args, StatefulSetModel);
  return { items: [...(editCount.item ? [editCount.item] : []), restart], dialog: editCount.dialog };
}
