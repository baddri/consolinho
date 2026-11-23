import { useCallback } from 'react';
import type { Deployment, K8sResource } from '@/shared/k8s';
import { ReplicaSetModel } from '@/shared/k8s';
import { useResourceDetails } from '../../details/detailsContext';
import { useResourceDataView } from '../../list/ResourceDataView';
import { ageColumn, nameColumn } from '../../registry/columns';
import {
  replicaSetDescriptor,
  replicaSetStatusColumn,
  type ReplicaSetResource,
} from '../../registry/kinds/replicasets';
import type { ResourceDescriptor } from '../../registry/types';
import { revisionNumber, revisionOf } from './revision';

/**
 * The ReplicaSet kind as this tab shows it: Name, Status, Revision, Created, newest revision first. Same model, row
 * actions (Rollback) and filters as the ReplicaSets page.
 */
const deploymentReplicaSetsDescriptor: ResourceDescriptor<ReplicaSetResource> = {
  ...replicaSetDescriptor,
  columns: [
    nameColumn(ReplicaSetModel),
    replicaSetStatusColumn,
    {
      id: 'revision',
      title: 'Revision',
      cell: (replicaSet) => revisionOf(replicaSet) ?? '-',
      sortValue: revisionNumber,
    },
    ageColumn<ReplicaSetResource>(),
  ],
  defaultSort: { columnId: 'revision', direction: 'desc' },
};

/**
 * ReplicaSets tab of a Deployment (OCP `ReplicaSetsTab`, DEP-9): the ReplicaSets matching the Deployment's selector
 * in its namespace, kept to those it owns (`ownerReferences[].uid`; a selector alone can match another Deployment's),
 * newest revision first. Lazy route module; the details layout renders the labelled tabpanel around it.
 */
export function DeploymentReplicaSetsTab() {
  const { cluster, obj } = useResourceDetails();
  const deployment = obj as Deployment & K8sResource;
  const uid = deployment.metadata.uid;
  const ownedByDeployment = useCallback(
    (replicaSet: K8sResource) => replicaSet.metadata.ownerReferences?.some((ref) => ref.uid === uid) === true,
    [uid],
  );
  const { dataView } = useResourceDataView({
    descriptor: deploymentReplicaSetsDescriptor,
    cluster,
    scope: 'ns',
    namespace: deployment.metadata.namespace,
    fixedSelector: deployment.spec?.selector.matchLabels ?? {},
    rowFilter: ownedByDeployment,
  });
  return dataView;
}
