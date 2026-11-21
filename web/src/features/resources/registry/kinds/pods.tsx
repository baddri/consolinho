import { PodModel, type K8sResource, type Pod } from '@/shared/k8s';
import { ObjectReferenceLink } from '../../components/ObjectReferenceLink';
import { ResourceStatusLabel, statusColor } from '../../components/ResourceStatusLabel';
import { PodDetails } from '../../details/sections/PodDetails';
import { ageColumn, nameColumn, namespaceColumn } from '../columns';
import type { ResourceDescriptor, ResourceStatus } from '../types';

/** A listed pod (list items are stamped with `apiVersion`/`kind`, so `metadata` is always there). */
export type PodResource = Pod & K8sResource;

/** Status words the status filter offers; anything else is filtered as `Unknown`. */
const FILTER_STATUSES = ['Running', 'Pending', 'Failed', 'Succeeded', 'CrashLoopBackOff'];

/**
 * The status the OpenShift console shows for a pod: `Terminating` while being deleted, else the first container's
 * waiting or terminated reason (`CrashLoopBackOff`, `ContainerCreating`, `Completed`), else `status.phase`.
 */
export function podStatus(pod: Pod): string {
  if (pod.metadata?.deletionTimestamp) return 'Terminating';
  for (const container of pod.status?.containerStatuses ?? []) {
    const reason = container.state?.waiting?.reason ?? container.state?.terminated?.reason;
    if (reason) return reason;
  }
  return pod.status?.phase ?? 'Unknown';
}

/** Bucket of the status filter: the shown status if it is a filter option, else the phase if it is, else `Unknown`. */
function filterStatus(pod: Pod): string {
  const status = podStatus(pod);
  if (FILTER_STATUSES.includes(status)) return status;
  const phase = pod.status?.phase;
  return phase !== undefined && FILTER_STATUSES.includes(phase) ? phase : 'Unknown';
}

function readyCount(pod: Pod): { ready: number; total: number } {
  const statuses = pod.status?.containerStatuses ?? [];
  return {
    ready: statuses.filter((container) => container.ready).length,
    total: pod.spec?.containers.length ?? statuses.length,
  };
}

function restarts(pod: Pod): number {
  return (pod.status?.containerStatuses ?? []).reduce((sum, container) => sum + container.restartCount, 0);
}

function status(pod: PodResource): ResourceStatus {
  const title = podStatus(pod);
  return { title, color: statusColor(title) };
}

/** Pods (UI-3): Name, Namespace, Status, Ready, Restarts, Owner (≥ lg), Created (≥ 2xl, as OCP); status filter. */
export const podDescriptor: ResourceDescriptor<PodResource> = {
  model: PodModel,
  nav: { section: 'workloads', order: 10 },
  status,
  DetailsSection: PodDetails,
  columns: [
    nameColumn(PodModel),
    namespaceColumn(PodModel),
    {
      id: 'status',
      title: 'Status',
      cell: (pod) => <ResourceStatusLabel status={status(pod)} />,
      sortValue: podStatus,
    },
    {
      id: 'ready',
      title: 'Ready',
      width: 10,
      cell: (pod) => {
        const { ready, total } = readyCount(pod);
        return `${ready}/${total}`;
      },
      sortValue: (pod) => readyCount(pod).ready,
    },
    { id: 'restarts', title: 'Restarts', width: 10, cell: restarts, sortValue: restarts },
    {
      id: 'owner',
      title: 'Owner',
      visibility: ['hidden', 'visibleOnLg'],
      cell: (pod) => {
        const owner = pod.metadata.ownerReferences?.[0];
        return (
          <ObjectReferenceLink
            apiVersion={owner?.apiVersion}
            kind={owner?.kind}
            name={owner?.name}
            namespace={pod.metadata.namespace}
          />
        );
      },
      sortValue: (pod) => pod.metadata.ownerReferences?.[0]?.name ?? null,
    },
    // OCP `pod-list.tsx`: Created is the first column to go, so all headers fit untruncated next to the sidebar at 1280.
    { ...ageColumn<PodResource>(), visibility: ['hidden', 'visibleOn2Xl'] },
  ],
  filters: [
    {
      id: 'status',
      title: 'Status',
      options: [...FILTER_STATUSES, 'Unknown'].map((value) => ({ value, label: value })),
      matches: (pod, values) => values.includes(filterStatus(pod)),
    },
  ],
};
