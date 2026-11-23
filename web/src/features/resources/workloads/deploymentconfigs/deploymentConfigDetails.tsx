import { Alert } from '@patternfly/react-core';
import { ExternalLinkButton } from '@patternfly/react-component-groups';
import { useActiveCluster } from '@/features/cluster-context';
import { DeploymentConfigModel, type DeploymentConfig } from '@/shared/k8s';
import { DetailsItem, DetailsSubsection, Status } from '@/shared/ui';
import { ConditionsTable } from '../../components/ConditionsTable';
import { ContainersTable } from '../../components/ContainersTable';
import { VolumesTable } from '../../components/VolumesTable';
import type { ResourceStatus } from '../../registry/types';
import { WorkloadPodRing } from '../scale/WorkloadPodRing';
import { DeploymentConfigPausedAlert } from './DeploymentConfigPausedAlert';

/** Desired replicas; the API server defaults an omitted `spec.replicas` to 1. */
export function deploymentConfigDesired(dc: DeploymentConfig): number {
  return dc.spec?.replicas ?? 1;
}

/** Current replicas (`status.replicas`), the first number of OCP's "N of M pods". */
export function deploymentConfigCurrent(dc: DeploymentConfig): number {
  return dc.status?.replicas ?? 0;
}

/** "`status.replicas` of `spec.replicas` pods", OCP's workload Status column (plain text, links to the Pods tab). */
export function deploymentConfigStatus(dc: DeploymentConfig): ResourceStatus {
  return {
    title: `${String(deploymentConfigCurrent(dc))} of ${String(deploymentConfigDesired(dc))} pods`,
  };
}

/**
 * OCP `getDeploymentConfigStatus`: "Failed" on a `ProgressDeadlineExceeded` or `ReplicaFailure` condition, "Up to
 * date" once every desired replica is updated and available, else "Updating".
 */
export function deploymentConfigRolloutStatus(dc: DeploymentConfig): 'Failed' | 'Up to date' | 'Updating' {
  const conditions = dc.status?.conditions ?? [];
  const failed = conditions.some(
    (c) =>
      (c.type === 'Progressing' && c.reason === 'ProgressDeadlineExceeded' && c.status === 'False') ||
      (c.type === 'ReplicaFailure' && c.status === 'True'),
  );
  if (failed) return 'Failed';
  const status = dc.status;
  const upToDate =
    status?.availableReplicas === status?.updatedReplicas &&
    deploymentConfigDesired(dc) === (status?.availableReplicas ?? 0);
  return upToDate ? 'Up to date' : 'Updating';
}

/** "N second(s)", OCP's `{{count}} second` plural. */
function seconds(count: number): string {
  return `${String(count)} ${count === 1 ? 'second' : 'seconds'}`;
}

/** "pod" / "pods" for `count`, as OCP's `{{count}} pod` plural. */
function pods(count: number): string {
  return count === 1 ? 'pod' : 'pods';
}

/** Above the grid, as OCP `DeploymentConfigsDetails`: the paused alert (when paused), then the scalable pod ring. */
export function DeploymentConfigDetailsTop({ obj }: { obj: DeploymentConfig }) {
  const cluster = useActiveCluster();
  if (cluster === undefined) return null;
  const { selector, ...spec } = obj.spec ?? {};
  return (
    <>
      <DeploymentConfigPausedAlert cluster={cluster} dc={obj} />
      {/* The ring reads `spec.selector.matchLabels`; a DC's selector is the plain map, passed separately. */}
      <WorkloadPodRing cluster={cluster} model={DeploymentConfigModel} obj={{ ...obj, spec }} selector={selector} />
    </>
  );
}

/** "Status" row of the metadata column (OCP shows it there rather than in the heading). */
export function DeploymentConfigStatusRow({ obj }: { obj: DeploymentConfig }) {
  return (
    <DetailsItem label="Status">
      <Status status={deploymentConfigRolloutStatus(obj)} />
    </DetailsItem>
  );
}

/**
 * Right column of the Details tab, OCP `DeploymentConfigDetailsList`: Latest version, Message (when set), Update
 * strategy; for `Rolling` also Timeout, Update period, Interval (each when set), Max unavailable, Max surge; then Min
 * ready seconds and Triggers (when any).
 */
export function DeploymentConfigDetails({ obj }: { obj: DeploymentConfig }) {
  const strategy = obj.spec?.strategy;
  const rolling = strategy?.rollingParams;
  const replicas = obj.spec?.replicas ?? 1;
  const message = obj.status?.details?.message;
  const triggers = (obj.spec?.triggers ?? []).map((trigger) => trigger.type).join(', ');
  return (
    <>
      <DetailsItem label="Latest version">{obj.status?.latestVersion ?? '-'}</DetailsItem>
      {message && <DetailsItem label="Message">{message}</DetailsItem>}
      <DetailsItem label="Update strategy">{strategy?.type ?? '-'}</DetailsItem>
      {strategy?.type === 'Rolling' && (
        <>
          {rolling?.timeoutSeconds !== undefined && (
            <DetailsItem label="Timeout">{seconds(rolling.timeoutSeconds)}</DetailsItem>
          )}
          {rolling?.updatePeriodSeconds !== undefined && (
            <DetailsItem label="Update period">{seconds(rolling.updatePeriodSeconds)}</DetailsItem>
          )}
          {rolling?.intervalSeconds !== undefined && (
            <DetailsItem label="Interval">{seconds(rolling.intervalSeconds)}</DetailsItem>
          )}
          <DetailsItem label="Max unavailable">
            {`${String(rolling?.maxUnavailable ?? 1)} of ${String(replicas)} ${pods(replicas)}`}
          </DetailsItem>
          <DetailsItem label="Max surge">
            {`${String(rolling?.maxSurge ?? 1)} greater than ${String(replicas)} ${pods(replicas)}`}
          </DetailsItem>
        </>
      )}
      <DetailsItem label="Min ready seconds">
        {obj.spec?.minReadySeconds ? seconds(obj.spec.minReadySeconds) : 'Not configured'}
      </DetailsItem>
      {triggers && <DetailsItem label="Triggers">{triggers}</DetailsItem>}
    </>
  );
}

/** Sections below the grid (OCP `DeploymentConfigsDetails`): Containers, Volumes, Conditions. */
export function DeploymentConfigSections({ obj }: { obj: DeploymentConfig }) {
  const podSpec = obj.spec?.template?.spec;
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

/** Upstream docs page OCP's deprecation alert links to (`documentationURLs.deprecatedDeploymentConfig`). */
export const DEPLOYMENTS_DOCS_URL = 'https://docs.okd.io/latest/applications/deployments/what-deployments-are.html';

/**
 * OCP `DeploymentConfigDeprecationAlert` under the DeploymentConfigs list and details headings: an inline info alert, shown on every
 * cluster regardless of its version (as OCP), linking to the Deployments docs.
 */
export function DeploymentConfigDeprecationAlert() {
  return (
    <Alert isInline variant="info" title="DeploymentConfig is being deprecated with OpenShift 4.14">
      <p>Feature development of DeploymentConfigs will be deprecated in OpenShift Container Platform 4.14.</p>
      <p>
        DeploymentConfigs will continue to be supported for security and critical fixes, but you should migrate to
        Deployments wherever it is possible.
      </p>
      {/* OCP `ExternalLink`: an inline link button with `display: inline` and its own icon gap. */}
      <ExternalLinkButton
        variant="link"
        isInline
        href={DEPLOYMENTS_DOCS_URL}
        className="pf-v6-u-display-inline pf-v6-u-mt-md"
        iconProps={{ className: 'pf-v6-u-ml-xs' }}
      >
        Learn more about Deployments
      </ExternalLinkButton>
    </Alert>
  );
}
