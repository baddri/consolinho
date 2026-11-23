import { useActiveCluster } from '@/features/cluster-context';
import { DeploymentModel, type Deployment, type K8sResource } from '@/shared/k8s';
import { DetailsItem, DetailsSubsection, Status } from '@/shared/ui';
import { ConditionsTable } from '../../components/ConditionsTable';
import { ContainersTable } from '../../components/ContainersTable';
import { PodRing } from '../../components/PodRing';
import { VolumesTable } from '../../components/VolumesTable';
import { DeploymentPausedAlert } from '../../workloads/deployments/DeploymentPausedAlert';
import { useDeploymentActions } from '../../workloads/deployments/useDeploymentActions';
import {
  PodSelectorLink,
  ReplicasCountLink,
  labelSelectorString,
  labelsColumn,
  nameColumn,
  namespaceColumn,
} from '../columns';
import type { ResourceDescriptor, ResourceStatus } from '../types';

/** A listed deployment (`metadata` always present). */
export type DeploymentResource = Deployment & K8sResource;

/** Desired replicas; the API server defaults an omitted `spec.replicas` to 1. */
function desired(deployment: Deployment): number {
  return deployment.spec?.replicas ?? 1;
}

/** Current replicas (`status.replicas`), the first number of OCP's "N of M pods". */
function current(deployment: Deployment): number {
  return deployment.status?.replicas ?? 0;
}

/**
 * "`status.replicas` of `spec.replicas` pods", as OCP's workload Status column (`workload-table.tsx`
 * `ReplicasCount`): plain text (no status icon), linking to the Pods tab in lists (`ReplicasCountLink`).
 */
export function deploymentStatus(deployment: Deployment): ResourceStatus {
  return { title: `${String(current(deployment))} of ${String(desired(deployment))} pods` };
}

/** OCP `DeploymentDetails` Status row: "Up to date" once all replicas are updated and available, else "Updating". */
export function rolloutStatus(deployment: Deployment): 'Up to date' | 'Updating' {
  const status = deployment.status;
  const upToDate =
    (status?.availableReplicas ?? 0) === (status?.updatedReplicas ?? 0) &&
    desired(deployment) === (status?.availableReplicas ?? 0);
  return upToDate ? 'Up to date' : 'Updating';
}

/** "N seconds" (OCP `{{count}} second`), or "Not configured". */
function secondsText(seconds: number | undefined): string {
  if (!seconds) return 'Not configured';
  return `${String(seconds)} ${seconds === 1 ? 'second' : 'seconds'}`;
}

/** "pod" / "pods" for `count`, as OCP's `{{count}} pod` plural. */
function pods(count: number): string {
  return count === 1 ? 'pod' : 'pods';
}

/** Above the grid, as OCP `DeploymentDetails`: the paused alert (when paused), then the ring of the live pods. */
function DeploymentDetailsTop({ obj }: { obj: DeploymentResource }) {
  const cluster = useActiveCluster();
  if (cluster === undefined) return null;
  return (
    <>
      <DeploymentPausedAlert cluster={cluster} deployment={obj} />
      <PodRing cluster={cluster} workload={obj} selector={obj.spec?.selector.matchLabels} />
    </>
  );
}

/** "Status" row of the metadata column (OCP shows it there rather than in the heading). */
function DeploymentStatusRow({ obj }: { obj: DeploymentResource }) {
  return (
    <DetailsItem label="Status">
      <Status status={rolloutStatus(obj)} />
    </DetailsItem>
  );
}

/**
 * Right column of the Details tab, OCP `DeploymentDetailsList` (`deployment.tsx`): Update strategy, Max unavailable
 * and Max surge (rolling updates only, "1 of 2 pods" / "3 greater than 2 pods"), Progress deadline seconds, Min ready
 * seconds.
 */
function DeploymentDetails({ obj }: { obj: DeploymentResource }) {
  const strategy = obj.spec?.strategy;
  const type = strategy?.type ?? 'RollingUpdate';
  const replicas = desired(obj);
  return (
    <>
      <DetailsItem label="Update strategy">{type}</DetailsItem>
      {type === 'RollingUpdate' && (
        <>
          <DetailsItem label="Max unavailable">
            {`${String(strategy?.rollingUpdate?.maxUnavailable ?? 1)} of ${String(replicas)} ${pods(replicas)}`}
          </DetailsItem>
          <DetailsItem label="Max surge">
            {`${String(strategy?.rollingUpdate?.maxSurge ?? 1)} greater than ${String(replicas)} ${pods(replicas)}`}
          </DetailsItem>
        </>
      )}
      <DetailsItem label="Progress deadline seconds">
        {secondsText(obj.spec?.progressDeadlineSeconds)}
      </DetailsItem>
      <DetailsItem label="Min ready seconds">{secondsText(obj.spec?.minReadySeconds)}</DetailsItem>
    </>
  );
}

/** Sections below the deployment's details grid (OCP `DeploymentDetails`): Containers, Volumes, Conditions. */
function DeploymentSections({ obj }: { obj: DeploymentResource }) {
  const podSpec = obj.spec?.template.spec;
  return (
    <>
      <DetailsSubsection title="Containers">
        <ContainersTable containers={podSpec?.containers ?? []} />
      </DetailsSubsection>
      <DetailsSubsection title="Volumes">
        <VolumesTable spec={podSpec} namespace={obj.metadata.namespace} />
      </DetailsSubsection>
      <DetailsSubsection title="Conditions">
        <ConditionsTable conditions={obj.status?.conditions} />
      </DetailsSubsection>
    </>
  );
}

/** Deployments (UI-3, OCP `workload-table.tsx`): Name, Namespace, Status, Labels, Pod selector. */
export const deploymentDescriptor: ResourceDescriptor<DeploymentResource> = {
  model: DeploymentModel,
  nav: { section: 'workloads', order: 20 },
  status: deploymentStatus,
  hideHeadingStatus: true,
  summary: {
    podSelector: (deployment) => deployment.spec?.selector.matchLabels,
    nodeSelector: (deployment) => deployment.spec?.template.spec?.nodeSelector,
    tolerations: (deployment) => deployment.spec?.template.spec?.tolerations,
    Extra: DeploymentStatusRow,
  },
  DetailsTop: DeploymentDetailsTop,
  DetailsSection: DeploymentDetails,
  ExtraSections: DeploymentSections,
  podsSelector: (deployment) => deployment.spec?.selector.matchLabels,
  // OCP Deployment tabs: Details, YAML, ReplicaSets, Pods, Events.
  extraTabs: ['replicasets'],
  useKindActions: useDeploymentActions,
  columns: [
    nameColumn(DeploymentModel),
    namespaceColumn(DeploymentModel),
    {
      id: 'status',
      title: 'Status',
      cell: (deployment) => (
        <ReplicasCountLink
          model={DeploymentModel}
          obj={deployment}
          title={deploymentStatus(deployment).title}
        />
      ),
      sortValue: (deployment) => current(deployment) / Math.max(desired(deployment), 1),
    },
    labelsColumn(DeploymentModel),
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
  ],
};
