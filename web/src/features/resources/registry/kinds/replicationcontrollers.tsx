import { ReplicationControllerModel } from '@/shared/k8s';
import { OwnerReferences } from '../../components/ObjectReferenceLink';
import {
  ReplicationControllerDetails,
  ReplicationControllerRevisionRow,
  ReplicationControllerSections,
  replicationControllerPhaseColumn,
  replicationControllerStatus,
  replicationControllerStatusColumn,
  type ReplicationControllerResource,
} from '../../workloads/replicationcontrollers/replicationControllerDetails';
import { useReplicationControllerActions } from '../../workloads/replicationcontrollers/useReplicationControllerActions';
import { ageColumn, nameColumn, namespaceColumn } from '../columns';
import type { ResourceDescriptor } from '../types';

export type { ReplicationControllerResource };

/**
 * ReplicationControllers (WL-1/5, OCP `replication-controller.tsx`; mostly a DeploymentConfig's rollouts). List: Name,
 * Namespace, Status ("N of M pods" → Pods tab), Phase (`openshift.io/deployment.phase`), Owner, Created. Details:
 * metadata with pod/node selector, tolerations and Deployment revision; Phase, current/desired count; Containers,
 * Volumes; tabs Details, YAML, Pods, Events. Heading status: the phase. Kind action: Edit Pod count (T-0193 adds the
 * DeploymentConfig ones).
 */
export const replicationControllerDescriptor: ResourceDescriptor<ReplicationControllerResource> = {
  model: ReplicationControllerModel,
  nav: { section: 'workloads', order: 110 },
  status: replicationControllerStatus,
  summary: {
    podSelector: (rc) => ({ matchLabels: rc.spec?.selector }),
    nodeSelector: (rc) => rc.spec?.template?.spec?.nodeSelector,
    tolerations: (rc) => rc.spec?.template?.spec?.tolerations,
    Extra: ReplicationControllerRevisionRow,
  },
  DetailsSection: ReplicationControllerDetails,
  ExtraSections: ReplicationControllerSections,
  podsSelector: (rc) => ({ matchLabels: rc.spec?.selector }),
  useKindActions: useReplicationControllerActions,
  columns: [
    nameColumn(ReplicationControllerModel),
    namespaceColumn(ReplicationControllerModel),
    replicationControllerStatusColumn,
    replicationControllerPhaseColumn,
    {
      id: 'owner',
      title: 'Owner',
      cell: (rc) => <OwnerReferences obj={rc} />,
      sortValue: (rc) => rc.metadata.ownerReferences?.[0]?.name ?? null,
    },
    ageColumn(),
  ],
};
