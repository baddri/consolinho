import { ReplicaSetModel, type K8sResource, type ReplicaSet } from '@/shared/k8s';
import { DetailsItem, DetailsSubsection } from '@/shared/ui';
import { ContainersTable } from '../../components/ContainersTable';
import { OwnerReferences } from '../../components/ObjectReferenceLink';
import { VolumesTable } from '../../components/VolumesTable';
import { revisionOf } from '../../workloads/replicasets/revision';
import { useReplicaSetActions } from '../../workloads/replicasets/useReplicaSetActions';
import { ReplicasCountLink, ageColumn, labelsColumn, nameColumn, namespaceColumn } from '../columns';
import type { ColumnDef, ResourceDescriptor, ResourceStatus } from '../types';

/** A listed replica set (`metadata` always present). */
export type ReplicaSetResource = ReplicaSet & K8sResource;

function desired(replicaSet: ReplicaSet): number {
  return replicaSet.spec?.replicas ?? 1;
}

function current(replicaSet: ReplicaSet): number {
  return replicaSet.status?.replicas ?? 0;
}

/** "`status.replicas` of `spec.replicas` pods", as OCP's workload Status column. */
function status(replicaSet: ReplicaSet): ResourceStatus {
  return { title: `${String(current(replicaSet))} of ${String(desired(replicaSet))} pods` };
}

/** Status column: "N of M pods" linking to the Pods tab; shared with a Deployment's ReplicaSets tab. */
export const replicaSetStatusColumn: ColumnDef<ReplicaSetResource> = {
  id: 'status',
  title: 'Status',
  cell: (replicaSet) => (
    <ReplicasCountLink model={ReplicaSetModel} obj={replicaSet} title={status(replicaSet).title} />
  ),
  sortValue: (replicaSet) => current(replicaSet) / Math.max(desired(replicaSet), 1),
};

/** OCP's "Deployment revision" row after the annotations (only for replica sets of a deployment). */
function RevisionRow({ obj }: { obj: ReplicaSetResource }) {
  const revision = revisionOf(obj);
  return revision === undefined ? null : <DetailsItem label="Deployment revision">{revision}</DetailsItem>;
}

/** Right column, OCP `ResourcePodCount`: Current count, Desired count. */
function ReplicaSetDetails({ obj }: { obj: ReplicaSetResource }) {
  return (
    <>
      <DetailsItem label="Current count">{current(obj)}</DetailsItem>
      <DetailsItem label="Desired count">{obj.spec?.replicas ?? 0}</DetailsItem>
    </>
  );
}

/** Sections below the grid (OCP `replica-set.tsx`): Containers, Volumes. */
function ReplicaSetSections({ obj }: { obj: ReplicaSetResource }) {
  const podSpec = obj.spec?.template?.spec;
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
 * ReplicaSets (T-0129; OCP `replica-set.tsx`): the owners of a deployment's pods, so pod Owner links resolve. List:
 * Name, Namespace, Status ("N of M pods" → Pods tab), Labels, Owner (≥ lg; ≥ 2xl in all projects), Created (≥ 2xl).
 * Details: metadata with pod/node selector, tolerations and revision; current/desired count; Containers, Volumes; a
 * Pods tab. Kind action: "Rollback" of the owning Deployment (T-0185).
 */
export const replicaSetDescriptor: ResourceDescriptor<ReplicaSetResource> = {
  model: ReplicaSetModel,
  nav: { section: 'workloads', order: 40 },
  status,
  hideHeadingStatus: true,
  summary: {
    podSelector: (replicaSet) => replicaSet.spec?.selector.matchLabels,
    nodeSelector: (replicaSet) => replicaSet.spec?.template?.spec?.nodeSelector,
    tolerations: (replicaSet) => replicaSet.spec?.template?.spec?.tolerations,
    Extra: RevisionRow,
  },
  DetailsSection: ReplicaSetDetails,
  ExtraSections: ReplicaSetSections,
  podsSelector: (replicaSet) => replicaSet.spec?.selector.matchLabels,
  useKindActions: useReplicaSetActions,
  columns: [
    nameColumn(ReplicaSetModel),
    namespaceColumn(ReplicaSetModel),
    replicaSetStatusColumn,
    labelsColumn(ReplicaSetModel),
    {
      id: 'owner',
      title: 'Owner',
      visibility: ['hidden', 'visibleOnLg'],
      // As on Pods: next to Namespace and Labels, Owner would push the table into horizontal scroll at 1280.
      allNamespacesVisibility: ['hidden', 'visibleOn2Xl'],
      cell: (replicaSet) => <OwnerReferences obj={replicaSet} />,
      sortValue: (replicaSet) => replicaSet.metadata.ownerReferences?.[0]?.name ?? null,
    },
    { ...ageColumn<ReplicaSetResource>(), visibility: ['hidden', 'visibleOn2Xl'] },
  ],
};
