import { Alert, AlertActionLink, Tooltip } from '@patternfly/react-core';
import { DeploymentConfigModel, type DeploymentConfig } from '@/shared/k8s';
import { useActionAccess } from '../../actions/useActionAccess';
import { useTogglePaused } from '../deployments/useDeploymentRollout';

/** Props for {@link DeploymentConfigPausedAlert}. */
export interface DeploymentConfigPausedAlertProps {
  cluster: string;
  dc: DeploymentConfig;
}

/**
 * OCP `WorkloadPausedAlert` on a paused DeploymentConfig's Details tab: the DeploymentConfig twin of
 * `DeploymentPausedAlert` (same copy and layout; that one is typed to Deployments). Renders nothing unless paused, so
 * an unpaused DeploymentConfig costs no access review.
 */
export function DeploymentConfigPausedAlert({ cluster, dc }: DeploymentConfigPausedAlertProps) {
  if (dc.spec?.paused !== true) return null;
  return <PausedAlert cluster={cluster} dc={dc} />;
}

/** The alert itself; "Resume rollouts" is gated like the menu item (`patch deploymentconfigs`). */
function PausedAlert({ cluster, dc }: DeploymentConfigPausedAlertProps) {
  const namespace = dc.metadata.namespace;
  const name = dc.metadata.name ?? '';
  const access = useActionAccess(cluster, { verb: 'patch', model: DeploymentConfigModel, namespace, name }, true);
  const togglePaused = useTogglePaused(cluster, DeploymentConfigModel, dc);

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
