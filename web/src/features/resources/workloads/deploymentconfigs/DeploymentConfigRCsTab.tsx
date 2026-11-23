import { useCallback } from 'react';
import { ReplicationControllerModel, type DeploymentConfig, type K8sResource } from '@/shared/k8s';
import { useResourceDetails } from '../../details/detailsContext';
import { useResourceDataView } from '../../list/ResourceDataView';
import { ageColumn, nameColumn } from '../../registry/columns';
import { replicationControllerDescriptor } from '../../registry/kinds/replicationcontrollers';
import type { ResourceDescriptor } from '../../registry/types';
import {
  DC_LATEST_VERSION_ANNOTATION,
  replicationControllerPhaseColumn,
  replicationControllerStatusColumn,
  type ReplicationControllerResource,
} from '../replicationcontrollers/replicationControllerDetails';
import { deploymentConfigRevision } from './useRollbackDeploymentConfig';

/** Label the DeploymentConfig controller puts on each of its ReplicationControllers. */
export const DC_NAME_LABEL = 'openshift.io/deployment-config.name';

/**
 * The ReplicationController kind as this tab shows it: Name, Status, Phase, Revision, Created, newest revision first.
 * Same model, row actions (Rollback) and filters as the ReplicationControllers page.
 */
const deploymentConfigRCsDescriptor: ResourceDescriptor<ReplicationControllerResource> = {
  ...replicationControllerDescriptor,
  columns: [
    nameColumn(ReplicationControllerModel),
    replicationControllerStatusColumn,
    replicationControllerPhaseColumn,
    {
      id: 'revision',
      title: 'Revision',
      cell: (rc) => rc.metadata.annotations?.[DC_LATEST_VERSION_ANNOTATION] ?? '-',
      sortValue: deploymentConfigRevision,
    },
    ageColumn<ReplicationControllerResource>(),
  ],
  defaultSort: { columnId: 'revision', direction: 'desc' },
};

/**
 * ReplicationControllers tab of a DeploymentConfig (OCP `ReplicationControllersTab`: one RC per rollout): the RCs
 * labelled with the DeploymentConfig's name in its namespace, kept to those it owns (`ownerReferences[].uid`, so a
 * deleted and recreated DeploymentConfig doesn't list its predecessor's), newest revision first. Lazy route module.
 */
export function DeploymentConfigRCsTab() {
  const { cluster, obj } = useResourceDetails();
  const dc = obj as DeploymentConfig;
  const uid = dc.metadata.uid;
  const ownedByDC = useCallback(
    (rc: K8sResource) => rc.metadata.ownerReferences?.some((ref) => ref.uid === uid) === true,
    [uid],
  );
  const { dataView } = useResourceDataView({
    descriptor: deploymentConfigRCsDescriptor,
    cluster,
    scope: 'ns',
    namespace: dc.metadata.namespace,
    fixedSelector: { [DC_NAME_LABEL]: dc.metadata.name ?? '' },
    rowFilter: ownedByDC,
  });
  return dataView;
}
