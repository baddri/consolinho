import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import { DeploymentModel, type Deployment, type K8sResource } from '@/shared/k8s';
import { DetailsItem, RelativeTime } from '@/shared/ui';
import { ResourceStatusLabel } from '../../components/ResourceStatusLabel';
import {
  PodSelectorLink,
  ageColumn,
  labelSelectorString,
  labelsColumn,
  nameColumn,
  namespaceColumn,
} from '../columns';
import type { ResourceDescriptor, ResourceStatus } from '../types';
import { DetailsSubsection } from '../../details/sections/DetailsSubsection';

/** A listed deployment (`metadata` always present). */
export type DeploymentResource = Deployment & K8sResource;

/** Desired replicas; the API server defaults an omitted `spec.replicas` to 1. */
function desired(deployment: Deployment): number {
  return deployment.spec?.replicas ?? 1;
}

function ready(deployment: Deployment): number {
  return deployment.status?.readyReplicas ?? 0;
}

/**
 * "`ready` of `desired` pods": red when the `Available` condition is False, green when all desired pods are ready,
 * orange while the rollout is still progressing.
 */
export function deploymentStatus(deployment: Deployment): ResourceStatus {
  const title = `${ready(deployment)} of ${desired(deployment)} pods`;
  const available = deployment.status?.conditions?.find((condition) => condition.type === 'Available');
  if (available?.status === 'False') return { title, color: 'red' };
  return { title, color: ready(deployment) === desired(deployment) ? 'green' : 'orange' };
}

/** "RollingUpdate (max surge 25%, max unavailable 25%)" or just the strategy type. */
function strategyText(deployment: Deployment): string {
  const strategy = deployment.spec?.strategy;
  const type = strategy?.type ?? 'RollingUpdate';
  const rolling = strategy?.rollingUpdate;
  if (type !== 'RollingUpdate' || !rolling) return type;
  return `${type} (max surge ${String(rolling.maxSurge ?? '25%')}, max unavailable ${String(rolling.maxUnavailable ?? '25%')})`;
}

/** Deployment conditions: type, status, reason, message and the last update. */
function ConditionsTable({ deployment }: { deployment: Deployment }) {
  return (
    <Table aria-label="Conditions" variant="compact">
      <Thead>
        <Tr>
          <Th>Type</Th>
          <Th>Status</Th>
          <Th>Reason</Th>
          <Th>Message</Th>
          <Th>Updated</Th>
        </Tr>
      </Thead>
      <Tbody>
        {(deployment.status?.conditions ?? []).map((condition) => (
          <Tr key={condition.type}>
            <Td dataLabel="Type">{condition.type}</Td>
            <Td dataLabel="Status">{condition.status}</Td>
            <Td dataLabel="Reason">{condition.reason ?? '—'}</Td>
            <Td dataLabel="Message" modifier="breakWord">
              {condition.message ?? '—'}
            </Td>
            <Td dataLabel="Updated">
              <RelativeTime value={condition.lastUpdateTime ?? condition.lastTransitionTime ?? null} />
            </Td>
          </Tr>
        ))}
      </Tbody>
    </Table>
  );
}

/** Deployment fields of the Details tab's right column (UI-4): replica counts, strategy and the pod selector. */
function DeploymentDetails({ obj }: { obj: DeploymentResource }) {
  const counts = obj.status;
  return (
    <>
      <DetailsItem label="Desired replicas">{desired(obj)}</DetailsItem>
      <DetailsItem label="Current replicas">{counts?.replicas ?? 0}</DetailsItem>
      <DetailsItem label="Ready replicas">{counts?.readyReplicas ?? 0}</DetailsItem>
      <DetailsItem label="Updated replicas">{counts?.updatedReplicas ?? 0}</DetailsItem>
      <DetailsItem label="Available replicas">{counts?.availableReplicas ?? 0}</DetailsItem>
      <DetailsItem label="Update strategy">{strategyText(obj)}</DetailsItem>
      <DetailsItem label="Pod selector">
        <PodSelectorLink namespace={obj.metadata.namespace} matchLabels={obj.spec?.selector.matchLabels} />
      </DetailsItem>
    </>
  );
}

/** Conditions section below the deployment's details grid (UI-4). */
function DeploymentConditions({ obj }: { obj: DeploymentResource }) {
  return (
    <DetailsSubsection title="Conditions">
      <ConditionsTable deployment={obj} />
    </DetailsSubsection>
  );
}

/** Deployments (UI-3): Name, Namespace, Status, Labels, Pod selector, Created. */
export const deploymentDescriptor: ResourceDescriptor<DeploymentResource> = {
  model: DeploymentModel,
  nav: { section: 'workloads', order: 20 },
  status: deploymentStatus,
  DetailsSection: DeploymentDetails,
  ExtraSections: DeploymentConditions,
  columns: [
    nameColumn(DeploymentModel),
    namespaceColumn(DeploymentModel),
    {
      id: 'status',
      title: 'Status',
      cell: (deployment) => <ResourceStatusLabel status={deploymentStatus(deployment)} />,
      sortValue: (deployment) => ready(deployment) / Math.max(desired(deployment), 1),
    },
    labelsColumn(),
    {
      id: 'selector',
      title: 'Pod selector',
      cell: (deployment) => (
        <PodSelectorLink
          namespace={deployment.metadata.namespace}
          matchLabels={deployment.spec?.selector.matchLabels}
        />
      ),
      sortValue: (deployment) => labelSelectorString(deployment.spec?.selector.matchLabels),
    },
    ageColumn(),
  ],
};
