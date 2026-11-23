import { Alert, AlertActionLink, Tooltip } from '@patternfly/react-core';
import { DeploymentModel, type Deployment, type K8sResource } from '@/shared/k8s';
import { useActionAccess } from '../../actions/useActionAccess';
import { useTogglePaused } from './useDeploymentRollout';

/** Props for {@link DeploymentPausedAlert}. */
export interface DeploymentPausedAlertProps {
  cluster: string;
  deployment: Deployment & K8sResource;
}

/**
 * OCP `WorkloadPausedAlert` (`workload-pause.tsx`, DEP-6) on a paused deployment's Details tab: an inline info alert
 * "<name> is paused" with a "Resume rollouts" link that writes `spec.paused: false` at once. Renders nothing unless
 * paused, so an unpaused deployment costs no access review.
 */
export function DeploymentPausedAlert({ cluster, deployment }: DeploymentPausedAlertProps) {
  if (deployment.spec?.paused !== true) return null;
  return <PausedAlert cluster={cluster} deployment={deployment} />;
}

/** The alert itself; its link is gated like the menu item (`patch deployments`), aria-disabled with the reason. */
function PausedAlert({ cluster, deployment }: DeploymentPausedAlertProps) {
  const namespace = deployment.metadata.namespace;
  const name = deployment.metadata.name ?? '';
  const access = useActionAccess(cluster, { verb: 'patch', model: DeploymentModel, namespace, name }, true);
  const togglePaused = useTogglePaused(cluster, deployment);

  const link = (
    <AlertActionLink
      isAriaDisabled={access.isAriaDisabled}
      onClick={() => {
        if (!access.isAriaDisabled) togglePaused.mutate({ namespace, name, paused: false });
      }}
    >
      Resume rollouts
    </AlertActionLink>
  );
  return (
    <Alert
      isInline
      variant="info"
      // OCP `.co-alert`: 24px below, above the ring.
      className="pf-v6-u-mb-lg"
      title={`${name} is paused`}
      actionLinks={access.tooltipProps ? <Tooltip {...access.tooltipProps}>{link}</Tooltip> : link}
    >
      This will stop any new rollouts or triggers from running until resumed.
    </Alert>
  );
}
