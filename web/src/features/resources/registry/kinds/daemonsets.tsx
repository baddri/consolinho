import { DaemonSetModel } from '@/shared/k8s';
import {
  DaemonSetDetailsList,
  DaemonSetDetailsTop,
  DaemonSetSections,
  daemonSetCurrent,
  daemonSetDesired,
  daemonSetStatus,
  useDaemonSetActions,
  type DaemonSetResource,
} from '../../workloads/daemonsets/daemonSetDetails';
import {
  PodSelectorLink,
  ReplicasCountLink,
  labelSelectorString,
  labelsColumn,
  nameColumn,
  namespaceColumn,
} from '../columns';
import type { ResourceDescriptor } from '../types';

export type { DaemonSetResource };

/**
 * DaemonSets (WL-2/4, OCP `daemon-set.tsx`). List: Name, Namespace, Status ("N of M pods" → Pods tab), Labels, Pod
 * selector. Details: read-only ring, metadata with pod/node selector and tolerations, Current/Desired count,
 * Containers, Volumes; tabs Details, YAML, Pods, Events. Kind action: Restart rollout.
 */
export const daemonSetDescriptor: ResourceDescriptor<DaemonSetResource> = {
  model: DaemonSetModel,
  nav: { section: 'workloads', order: 90 },
  status: daemonSetStatus,
  hideHeadingStatus: true,
  summary: {
    podSelector: (daemonSet) => daemonSet.spec?.selector.matchLabels,
    nodeSelector: (daemonSet) => daemonSet.spec?.template.spec?.nodeSelector,
    tolerations: (daemonSet) => daemonSet.spec?.template.spec?.tolerations,
  },
  DetailsTop: DaemonSetDetailsTop,
  DetailsSection: DaemonSetDetailsList,
  ExtraSections: DaemonSetSections,
  podsSelector: (daemonSet) => daemonSet.spec?.selector.matchLabels,
  // OCP `DaemonSetPods`: `showNodes`.
  podsShowNodes: true,
  useKindActions: useDaemonSetActions,
  columns: [
    nameColumn(DaemonSetModel),
    namespaceColumn(DaemonSetModel),
    {
      id: 'status',
      title: 'Status',
      cell: (daemonSet) => (
        <ReplicasCountLink model={DaemonSetModel} obj={daemonSet} title={daemonSetStatus(daemonSet).title} />
      ),
      sortValue: (daemonSet) => daemonSetCurrent(daemonSet) / Math.max(daemonSetDesired(daemonSet), 1),
    },
    labelsColumn(DaemonSetModel),
    {
      id: 'selector',
      title: 'Pod selector',
      cell: (daemonSet) => (
        <PodSelectorLink
          namespace={daemonSet.metadata.namespace}
          matchLabels={daemonSet.spec?.selector.matchLabels}
        />
      ),
      sortValue: (daemonSet) => labelSelectorString(daemonSet.spec?.selector.matchLabels),
    },
  ],
};
