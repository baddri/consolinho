import { StatefulSetModel } from '@/shared/k8s';
import {
  StatefulSetDetailsTop,
  StatefulSetSections,
  statefulSetCurrent,
  statefulSetDesired,
  statefulSetStatus,
  useStatefulSetActions,
  type StatefulSetResource,
} from '../../workloads/statefulsets/statefulSetDetails';
import {
  PodSelectorLink,
  ReplicasCountLink,
  labelSelectorString,
  labelsColumn,
  nameColumn,
  namespaceColumn,
} from '../columns';
import type { ResourceDescriptor } from '../types';

export type { StatefulSetResource };

/**
 * StatefulSets (WL-2/3, OCP `stateful-set.tsx`). List: Name, Namespace, Status ("N of M pods" → Pods tab), Labels,
 * Pod selector. Details: scalable ring, metadata with pod/node selector and tolerations, Containers, Volumes; tabs
 * Details, YAML, Pods, Events. Kind actions: Edit Pod count, Restart rollout.
 */
export const statefulSetDescriptor: ResourceDescriptor<StatefulSetResource> = {
  model: StatefulSetModel,
  nav: { section: 'workloads', order: 40 },
  status: statefulSetStatus,
  hideHeadingStatus: true,
  summary: {
    podSelector: (statefulSet) => statefulSet.spec?.selector,
    nodeSelector: (statefulSet) => statefulSet.spec?.template.spec?.nodeSelector,
    tolerations: (statefulSet) => statefulSet.spec?.template.spec?.tolerations,
  },
  DetailsTop: StatefulSetDetailsTop,
  ExtraSections: StatefulSetSections,
  podsSelector: (statefulSet) => statefulSet.spec?.selector,
  useKindActions: useStatefulSetActions,
  columns: [
    nameColumn(StatefulSetModel),
    namespaceColumn(StatefulSetModel),
    {
      id: 'status',
      title: 'Status',
      cell: (statefulSet) => (
        <ReplicasCountLink
          model={StatefulSetModel}
          obj={statefulSet}
          title={statefulSetStatus(statefulSet).title}
        />
      ),
      sortValue: (statefulSet) =>
        statefulSetCurrent(statefulSet) / Math.max(statefulSetDesired(statefulSet), 1),
    },
    labelsColumn(StatefulSetModel),
    {
      id: 'selector',
      title: 'Pod selector',
      cell: (statefulSet) => (
        <PodSelectorLink namespace={statefulSet.metadata.namespace} selector={statefulSet.spec?.selector} />
      ),
      sortValue: (statefulSet) => labelSelectorString(statefulSet.spec?.selector),
    },
  ],
};
