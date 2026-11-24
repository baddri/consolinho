import { DeploymentConfigModel, type DeploymentConfig } from '@/shared/k8s';
import {
  DeploymentConfigDeprecationAlert,
  DeploymentConfigDetails,
  DeploymentConfigDetailsTop,
  DeploymentConfigSections,
  DeploymentConfigStatusRow,
  deploymentConfigCurrent,
  deploymentConfigDesired,
  deploymentConfigStatus,
} from '../../workloads/deploymentconfigs/deploymentConfigDetails';
import { useDeploymentConfigActions } from '../../workloads/deploymentconfigs/useDeploymentConfigActions';
import {
  PodSelectorLink,
  ReplicasCountLink,
  labelSelectorString,
  labelsColumn,
  nameColumn,
  namespaceColumn,
} from '../columns';
import type { ResourceDescriptor } from '../types';

/** A listed DeploymentConfig (the hand-written type already carries `metadata`). */
export type DeploymentConfigResource = DeploymentConfig;

/**
 * DeploymentConfigs (WL-1/WL-6, OCP `deployment-config.tsx`; OpenShift-only, hidden where `apps.openshift.io` is not
 * served): Name, Namespace, Status, Labels, Pod selector as Deployments; the deprecation alert under the list and details headings;
 * details with the pod ring, "DeploymentConfig details", Containers, Volumes, Conditions; tabs Details, YAML,
 * ReplicationControllers, Pods, Events.
 */
export const deploymentConfigDescriptor: ResourceDescriptor<DeploymentConfigResource> = {
  model: DeploymentConfigModel,
  nav: { section: 'workloads', order: 30 },
  status: deploymentConfigStatus,
  hideHeadingStatus: true,
  summary: {
    podSelector: (dc) => ({ matchLabels: dc.spec?.selector }),
    nodeSelector: (dc) => dc.spec?.template?.spec?.nodeSelector,
    tolerations: (dc) => dc.spec?.template?.spec?.tolerations,
    Extra: DeploymentConfigStatusRow,
  },
  DetailsTop: DeploymentConfigDetailsTop,
  DetailsSection: DeploymentConfigDetails,
  ExtraSections: DeploymentConfigSections,
  podsSelector: (dc) => ({ matchLabels: dc.spec?.selector }),
  extraTabs: ['replicationcontrollers'],
  useKindActions: useDeploymentConfigActions,
  HeadingAlert: DeploymentConfigDeprecationAlert,
  columns: [
    nameColumn(DeploymentConfigModel),
    namespaceColumn(DeploymentConfigModel),
    {
      id: 'status',
      title: 'Status',
      cell: (dc) => (
        <ReplicasCountLink model={DeploymentConfigModel} obj={dc} title={deploymentConfigStatus(dc).title} />
      ),
      sortValue: (dc) => deploymentConfigCurrent(dc) / Math.max(deploymentConfigDesired(dc), 1),
    },
    labelsColumn(DeploymentConfigModel),
    {
      id: 'selector',
      title: 'Pod selector',
      cell: (dc) => (
        <PodSelectorLink namespace={dc.metadata.namespace} selector={{ matchLabels: dc.spec?.selector }} />
      ),
      sortValue: (dc) => labelSelectorString({ matchLabels: dc.spec?.selector }),
    },
  ],
};
