import { PodModel, type K8sResource, type Pod } from '@/shared/k8s';
import { OwnerReferences } from '../../components/ObjectReferenceLink';
import { BadgedName } from '../../components/ResourceLink';
import { PodDetails, PodSections } from '../../details/sections/PodDetails';
import { PodStatus } from '../../workloads/pods/PodStatus';
import { podStatus } from '../../workloads/pods/podStatus';
import { ageColumn, nameColumn, namespaceColumn } from '../columns';
import type { ColumnDef, ResourceDescriptor, ResourceStatus } from '../types';

/** A listed pod (list items are stamped with `apiVersion`/`kind`, so `metadata` is always there). */
export type PodResource = Pod & K8sResource;

/** Status words the status filter offers; anything else is filtered as `Unknown`. */
const FILTER_STATUSES = ['Running', 'Pending', 'Failed', 'Succeeded', 'CrashLoopBackOff'];

// Lives with `PodStatus` (no import cycle); re-exported for the registry's callers.
export { podStatus };

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
  return { title: podStatus(pod) };
}

/** The Details tab's pod fields; Status as OCP `PodStatus` (popover for problem states, DEP-2). */
function PodDetailsSection({ obj }: { obj: PodResource }) {
  return <PodDetails obj={obj} status={<PodStatus pod={obj} />} />;
}

/** Owner: the pod's controller (≥ lg; ≥ 2xl in all projects). */
const ownerColumn: ColumnDef<PodResource> = {
  id: 'owner',
  title: 'Owner',
  visibility: ['hidden', 'visibleOnLg'],
  // With the Namespace column, Owner would push the table into horizontal scroll at 1280.
  allNamespacesVisibility: ['hidden', 'visibleOn2Xl'],
  cell: (pod) => <OwnerReferences obj={pod} />,
  sortValue: (pod) => pod.metadata.ownerReferences?.[0]?.name ?? null,
};

/**
 * Node, in the Owner column's place and breakpoints. OCP links it to the Node page; we have none yet, so it is the
 * badged name, as on the Pod details page.
 */
const nodeColumn: ColumnDef<PodResource> = {
  id: 'node',
  title: 'Node',
  visibility: ownerColumn.visibility,
  allNamespacesVisibility: ownerColumn.allNamespacesVisibility,
  cell: (pod) =>
    pod.spec?.nodeName && <BadgedName badge={{ kind: 'Node', abbr: 'N' }}>{pod.spec.nodeName}</BadgedName>,
  sortValue: (pod) => pod.spec?.nodeName ?? null,
};

/**
 * The Pods list columns (OCP `usePodsColumns(showNodes)`): Name, Namespace, Status, Ready, Restarts, Owner — or Node
 * with `showNodes`, where the owner is the page itself (DaemonSet, Job Pods tabs) — and Created.
 */
export function podColumns({ showNodes }: { showNodes: boolean }): ColumnDef<PodResource>[] {
  return [
    nameColumn(PodModel),
    namespaceColumn(PodModel),
    {
      id: 'status',
      title: 'Status',
      // A status (`CrashLoopBackOff`, `ContainerCreating`) doesn't wrap: start wide enough for it.
      width: 170,
      // OCP `PodStatus`: a popover explains problem states (DEP-2).
      cell: (pod) => <PodStatus pod={pod} />,
      sortValue: podStatus,
    },
    {
      id: 'ready',
      title: 'Ready',
      cell: (pod) => {
        const { ready, total } = readyCount(pod);
        return `${ready}/${total}`;
      },
      sortValue: (pod) => readyCount(pod).ready,
    },
    { id: 'restarts', title: 'Restarts', cell: restarts, sortValue: restarts },
    showNodes ? nodeColumn : ownerColumn,
    // OCP `pod-list.tsx`: Created is the first column to go, so all headers fit untruncated next to the sidebar at 1280.
    { ...ageColumn<PodResource>(), visibility: ['hidden', 'visibleOn2Xl'] },
  ];
}

/**
 * Pods (UI-3): Name, Namespace, Status, Ready, Restarts, Owner (≥ lg; ≥ 2xl in all projects), Created (≥ 2xl, as
 * OCP); status filter.
 */
export const podDescriptor: ResourceDescriptor<PodResource> = {
  model: PodModel,
  nav: { section: 'workloads', order: 10 },
  status,
  // OCP `PodResourceSummary`: node selector and tolerations after the labels.
  summary: { nodeSelector: (pod) => pod.spec?.nodeSelector, tolerations: (pod) => pod.spec?.tolerations },
  DetailsSection: PodDetailsSection,
  ExtraSections: PodSections,
  // OCP Pod tabs: Details, YAML, Logs, Events, Terminal.
  extraTabs: ['logs', 'terminal'],
  columns: podColumns({ showNodes: false }),
  filters: [
    {
      id: 'status',
      title: 'Status',
      options: [...FILTER_STATUSES, 'Unknown'].map((value) => ({ value, label: value })),
      matches: (pod, values) => values.includes(filterStatus(pod)),
    },
  ],
};

/**
 * The pod descriptor with Node instead of Owner (OCP `showNodes`), for the Pods tab of kinds with `podsShowNodes`.
 * A module constant, so the list's per-descriptor memos stay stable.
 */
export const podNodesDescriptor: ResourceDescriptor<PodResource> = {
  ...podDescriptor,
  columns: podColumns({ showNodes: true }),
};
