import { DescriptionList, Stack, StackItem, Title } from '@patternfly/react-core';
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import { DeploymentModel, type Deployment, type K8sResource } from '@/shared/k8s';
import { RelativeTime } from '@/shared/ui';
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
import { DetailItem } from './DetailItem';

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

/** Deployment part of the Details tab (UI-4): replica counts, strategy, selector and the conditions table. */
function DeploymentDetails({ obj }: { obj: DeploymentResource }) {
  const counts = obj.status;
  return (
    <Stack hasGutter>
      <StackItem>
        <DescriptionList aria-label="Deployment status" isCompact isHorizontal>
          <DetailItem term="Desired replicas">{desired(obj)}</DetailItem>
          <DetailItem term="Current replicas">{counts?.replicas ?? 0}</DetailItem>
          <DetailItem term="Ready replicas">{counts?.readyReplicas ?? 0}</DetailItem>
          <DetailItem term="Updated replicas">{counts?.updatedReplicas ?? 0}</DetailItem>
          <DetailItem term="Available replicas">{counts?.availableReplicas ?? 0}</DetailItem>
          <DetailItem term="Update strategy">{strategyText(obj)}</DetailItem>
          <DetailItem term="Pod selector">
            <PodSelectorLink
              namespace={obj.metadata.namespace}
              matchLabels={obj.spec?.selector.matchLabels}
            />
          </DetailItem>
        </DescriptionList>
      </StackItem>
      <StackItem>
        <Title headingLevel="h3">Conditions</Title>
      </StackItem>
      <StackItem>
        <ConditionsTable deployment={obj} />
      </StackItem>
    </Stack>
  );
}

/** Deployments (UI-3): Name, Namespace, Status, Labels, Pod selector, Created. */
export const deploymentDescriptor: ResourceDescriptor<DeploymentResource> = {
  model: DeploymentModel,
  nav: { section: 'workloads', order: 20 },
  status: deploymentStatus,
  DetailsSection: DeploymentDetails,
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
