import {
  k8sPatch,
  ReplicationControllerModel,
  useK8sList,
  type DeploymentConfig,
  type JsonPatchOp,
  type ReplicationController,
} from '@/shared/k8s';
import { useResourceMutation, type MutationTarget } from '../../actions/useResourceMutation';
import {
  DEPLOYMENT_PHASE_ANNOTATION,
  deploymentPhaseOf,
  type ReplicationControllerResource,
} from '../replicationcontrollers/replicationControllerDetails';
import { DC_NAME_LABEL } from './DeploymentConfigRCsTab';

/** OCP's tooltip on a disabled "Retry rollout" (`useRetryRolloutAction`). */
export const RETRY_ROLLOUT_DISABLED_REASON =
  'This action is only enabled when the latest revision of the ReplicationController resource is in a failed state.';

const CANCELLED_PATH = '/metadata/annotations/openshift.io~1deployment.cancelled';

/**
 * OCP's retry patch on the latest ReplicationController: phase back to `New`, a cancelled flag added and removed (so
 * the patch also clears any earlier one), and the failure reason removed. Like OCP it fails if the RC has no
 * `status-reason`, which the deployer always sets on a failed rollout.
 */
const RETRY_PATCH: JsonPatchOp[] = [
  { op: 'replace', path: `/metadata/annotations/${DEPLOYMENT_PHASE_ANNOTATION.replace('/', '~1')}`, value: 'New' },
  { op: 'add', path: CANCELLED_PATH, value: '' },
  { op: 'remove', path: CANCELLED_PATH },
  { op: 'remove', path: '/metadata/annotations/openshift.io~1deployment.status-reason' },
];

/**
 * The latest ReplicationController of `dc` (`<dc>-<status.latestVersion>`, as OCP names them) and whether OCP would
 * allow retrying it: not paused, a rollout exists and that RC's phase is `Failed`. The RCs come from one live
 * namespace-wide list of DeploymentConfig-owned RCs, shared by every row kebab, so a list page costs one request.
 */
export function useLatestFailedRC(cluster: string, dc: DeploymentConfig): { rcName?: string; canRetry: boolean } {
  const latestVersion = dc.status?.latestVersion ?? 0;
  const eligible = dc.spec?.paused !== true && latestVersion !== 0;
  const rcs = useK8sList<ReplicationControllerResource>(cluster, ReplicationControllerModel, {
    namespace: dc.metadata.namespace,
    labelSelector: DC_NAME_LABEL,
    enabled: eligible,
  });
  const rcName = `${dc.metadata.name ?? ''}-${latestVersion}`;
  const latest = eligible ? rcs.data?.find((rc) => rc.metadata.name === rcName) : undefined;
  return { rcName: latest ? rcName : undefined, canRetry: latest !== undefined && deploymentPhaseOf(latest) === 'Failed' };
}

/**
 * Retries a DeploymentConfig's failed rollout (OCP `useRetryRolloutAction`): JSON-patches the latest RC's
 * annotations (see {@link RETRY_PATCH}) so the deployer runs it again. `name` is the RC's name. Modal-less, so
 * failures toast "Retry rollout failed".
 */
export function useRetryRollout(cluster: string) {
  return useResourceMutation(cluster, {
    model: ReplicationControllerModel,
    mutationFn: ({ namespace, name }: MutationTarget) =>
      k8sPatch<ReplicationController>(cluster, ReplicationControllerModel, { namespace, name }, RETRY_PATCH),
    successMessage: ({ name }) => `Retrying rollout ${name}`,
    toastErrors: { action: 'Retry rollout' },
  });
}
