import { ReplicationControllerModel, type K8sResource, type ReplicationController } from '@/shared/k8s';
import { DetailsItem, DetailsSubsection, Status } from '@/shared/ui';
import { ContainersTable } from '../../components/ContainersTable';
import { VolumesTable } from '../../components/VolumesTable';
import { ReplicasCountLink } from '../../registry/columns';
import type { ColumnDef, ResourceStatus } from '../../registry/types';

/** A listed ReplicationController (`metadata` always present). */
export type ReplicationControllerResource = ReplicationController & K8sResource;

/** The rollout phase a DeploymentConfig's deployer stamps on each of its RCs (`New` … `Complete`, `Failed`). */
export const DEPLOYMENT_PHASE_ANNOTATION = 'openshift.io/deployment.phase';

/** The DeploymentConfig `latestVersion` an RC was created for, i.e. its "Deployment revision". */
export const DC_LATEST_VERSION_ANNOTATION = 'openshift.io/deployment-config.latest-version';

/** Desired replicas; the API server defaults an omitted `spec.replicas` to 1. */
export function replicationControllerDesired(rc: ReplicationController): number {
  return rc.spec?.replicas ?? 1;
}

/** Current replicas (`status.replicas`), the first number of OCP's "N of M pods". */
export function replicationControllerCurrent(rc: ReplicationController): number {
  return rc.status?.replicas ?? 0;
}

/** The RC's DeploymentConfig rollout phase, or `undefined` for an RC not created by a DeploymentConfig. */
export function deploymentPhaseOf(rc: K8sResource): string | undefined {
  return rc.metadata.annotations?.[DEPLOYMENT_PHASE_ANNOTATION];
}

/** The heading status, as OCP's `getResourceStatus`: the deployment phase; none without one. */
export function replicationControllerStatus(rc: ReplicationControllerResource): ResourceStatus | undefined {
  const phase = deploymentPhaseOf(rc);
  return phase ? { title: phase } : undefined;
}

/** Status column: "`status.replicas` of `spec.replicas` pods" linking to the Pods tab (OCP `ReplicasCount`). */
export const replicationControllerStatusColumn: ColumnDef<ReplicationControllerResource> = {
  id: 'status',
  title: 'Status',
  cell: (rc) => (
    <ReplicasCountLink
      model={ReplicationControllerModel}
      obj={rc}
      title={`${String(replicationControllerCurrent(rc))} of ${String(replicationControllerDesired(rc))} pods`}
    />
  ),
  sortValue: (rc) => replicationControllerCurrent(rc) / Math.max(replicationControllerDesired(rc), 1),
};

/** Phase column: the deployment phase as an OCP status icon + text, "—" for an RC outside a DeploymentConfig. */
export const replicationControllerPhaseColumn: ColumnDef<ReplicationControllerResource> = {
  id: 'phase',
  title: 'Phase',
  cell: (rc) => <Status status={deploymentPhaseOf(rc) ?? ''} />,
  sortValue: (rc) => deploymentPhaseOf(rc) ?? null,
};

/** OCP's "Deployment revision" row after the annotations, only for RCs of a DeploymentConfig. */
export function ReplicationControllerRevisionRow({ obj }: { obj: ReplicationControllerResource }) {
  const revision = obj.metadata.annotations?.[DC_LATEST_VERSION_ANNOTATION];
  return revision ? <DetailsItem label="Deployment revision">{revision}</DetailsItem> : null;
}

/** Right column, OCP `replication-controller.tsx` `Details`: Phase (when set), Current count, Desired count. */
export function ReplicationControllerDetails({ obj }: { obj: ReplicationControllerResource }) {
  const phase = deploymentPhaseOf(obj);
  return (
    <>
      {phase && (
        <DetailsItem label="Phase">
          <Status status={phase} />
        </DetailsItem>
      )}
      <DetailsItem label="Current count" path="status.replicas">
        {replicationControllerCurrent(obj)}
      </DetailsItem>
      <DetailsItem label="Desired count" path="spec.replicas">
        {replicationControllerDesired(obj)}
      </DetailsItem>
    </>
  );
}

/** Sections below the grid (OCP `replication-controller.tsx`): Containers, Volumes. */
export function ReplicationControllerSections({ obj }: { obj: ReplicationControllerResource }) {
  const podSpec = obj.spec?.template?.spec;
  return (
    <>
      <DetailsSubsection title="Containers">
        <ContainersTable containers={podSpec?.containers ?? []} />
      </DetailsSubsection>
      <DetailsSubsection title="Volumes">
        <VolumesTable spec={podSpec} namespace={obj.metadata.namespace} />
      </DetailsSubsection>
    </>
  );
}
