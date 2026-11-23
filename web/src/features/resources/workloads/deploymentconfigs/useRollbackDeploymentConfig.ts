import { DeploymentConfigModel, k8sCreateSubresource, k8sUpdate, type DeploymentConfig, type K8sResource } from '@/shared/k8s';
import { useResourceMutation, type MutationTarget } from '../../actions/useResourceMutation';
import { DC_LATEST_VERSION_ANNOTATION } from '../replicationcontrollers/replicationControllerDetails';

/** Which settings of the old ReplicationController a rollback takes besides its pod template (OCP's checkboxes). */
export interface RollbackSettings {
  includeReplicationMeta: boolean;
  includeStrategy: boolean;
  includeTriggers: boolean;
}

/** What {@link useRollbackDeploymentConfig} writes: the DeploymentConfig (target), the RC to roll back to, settings. */
export interface RollbackDeploymentConfigVars extends MutationTarget, RollbackSettings {
  replicationController: K8sResource;
}

/** The DeploymentConfig `latestVersion` an RC was created for (its revision), or 0 (the API's "latest") if unknown. */
export function deploymentConfigRevision(rc: K8sResource): number {
  const value = Number(rc.metadata.annotations?.[DC_LATEST_VERSION_ANNOTATION]);
  return Number.isInteger(value) ? value : 0;
}

/** The DeploymentConfig owning `rc` (its `ownerReferences` entry of that kind), or `undefined`. */
export function owningDeploymentConfigName(rc: K8sResource): string | undefined {
  return rc.metadata.ownerReferences?.find((ref) => ref.kind === DeploymentConfigModel.kind)?.name;
}

/**
 * Rolls a DeploymentConfig back to one of its ReplicationControllers as OCP `rollback-modal.tsx`
 * `submitDCRollback`: POST `…/rollback` with a `DeploymentConfigRollback` (the server answers with the rolled-back
 * DeploymentConfig without storing it), then PUT that object. Needs `create deploymentconfigs/rollback` and `update
 * deploymentconfigs`. Success toasts "Rolled back <dc> to revision <n> on <cluster>"; failures stay inline in the modal.
 */
export function useRollbackDeploymentConfig(cluster: string) {
  return useResourceMutation(cluster, {
    model: DeploymentConfigModel,
    mutationFn: async ({ namespace, name, replicationController, ...settings }: RollbackDeploymentConfigVars) => {
      const rolledBack = await k8sCreateSubresource<DeploymentConfig>(
        cluster,
        DeploymentConfigModel,
        { namespace, name, subresource: 'rollback' },
        {
          kind: 'DeploymentConfigRollback',
          apiVersion: 'apps.openshift.io/v1',
          name,
          spec: {
            from: { name: replicationController.metadata.name },
            revision: deploymentConfigRevision(replicationController),
            includeTemplate: true,
            ...settings,
          },
        },
      );
      return k8sUpdate(cluster, DeploymentConfigModel, rolledBack);
    },
    successMessage: ({ name, replicationController }) =>
      `Rolled back ${name} to revision ${String(deploymentConfigRevision(replicationController))}`,
  });
}
