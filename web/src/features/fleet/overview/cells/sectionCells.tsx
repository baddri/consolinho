import { Link } from 'react-router';
import type { FleetClusterStatus } from '@/shared/api';
import { clusterUpdate, clusterVersionText, type ClusterUpdate } from '@/shared/health';
import { NodeModel } from '@/shared/k8s';
import { DASH, StatusIconText, type StatusKind } from '@/shared/ui';
import { clusterSettingsPath, resourcePath } from '@/features/resources';
import { RestrictedText } from './RestrictedText';
import { SecondaryLine } from './SecondaryLine';

/** Props of the cells that read one fleet status line. */
export interface StatusLineCellProps {
  status: FleetClusterStatus;
}

/** Version (FLT-3): the OpenShift version, else the Kubernetes `gitVersion`; "Restricted" when that section is forbidden. */
export function VersionCell({ status }: StatusLineCellProps) {
  const text = clusterVersionText(status);
  if (text !== undefined) return <>{text}</>;
  if (status.clusterVersion?.outcome === 'forbidden') return <RestrictedText probe="ClusterVersion" />;
  if (status.kubernetesVersion?.outcome === 'forbidden') return <RestrictedText probe="version" />;
  return <>{DASH}</>;
}

/** Icon family and copy of each Update state (contract §2.1; icons as OCP's cluster update status). */
function updateDisplay(update: ClusterUpdate): { kind: StatusKind; text: string } {
  switch (update.kind) {
    case 'failing':
      return { kind: 'danger', text: 'Failing' };
    case 'updating':
      return { kind: 'progress', text: update.version ? `Updating to ${update.version}` : 'Updating' };
    case 'available':
      return { kind: 'info', text: 'Update available' };
    case 'upToDate':
      return { kind: 'success', text: 'Up to date' };
  }
}

/** Update (FLT-3): OpenShift only; "—" on Kubernetes or without a readable ClusterVersion. */
export function UpdateCell({ status }: StatusLineCellProps) {
  const update = clusterUpdate(status.clusterVersion);
  if (update) {
    const { kind, text } = updateDisplay(update);
    return <StatusIconText status={kind} text={text} />;
  }
  if (status.clusterVersion?.outcome === 'forbidden') return <RestrictedText probe="ClusterVersion" />;
  return <>{DASH}</>;
}

/** Operators (FLT-3): "All available" or the degraded / unavailable counts, linking to the ClusterOperators tab. */
export function OperatorsCell({ status }: StatusLineCellProps) {
  const operators = status.clusterOperators;
  if (operators?.outcome === 'forbidden') return <RestrictedText probe="ClusterOperators" />;
  if (operators?.outcome !== 'ok') return <>{DASH}</>;
  const degraded = operators.degraded ?? 0;
  const unavailable = operators.unavailable ?? 0;
  const text =
    degraded === 0 && unavailable === 0
      ? 'All available'
      : `${String(degraded)} degraded, ${String(unavailable)} unavailable`;
  return <Link to={clusterSettingsPath(status.cluster.name, 'clusteroperators')}>{text}</Link>;
}

/**
 * Nodes (FLT-3): "<ready> of <total> Ready" linking to the cluster's Nodes list, the Not Ready count in warning
 * text, and "<n> unschedulable" as a second line (OCP Nodes list status cell with its secondary status).
 */
export function NodesCell({ status }: StatusLineCellProps) {
  const nodes = status.nodes;
  if (nodes?.outcome === 'forbidden') return <RestrictedText probe="Nodes" />;
  if (nodes?.outcome !== 'ok') return <>{DASH}</>;
  const notReady = nodes.notReady ?? 0;
  const unschedulable = nodes.unschedulable ?? 0;
  return (
    <>
      <Link to={resourcePath(status.cluster.name, NodeModel)}>
        {`${String(nodes.ready ?? 0)} of ${String(nodes.total ?? 0)} Ready`}
      </Link>
      {notReady > 0 && (
        <span className="pf-v6-u-text-color-status-warning">{`, ${String(notReady)} Not Ready`}</span>
      )}
      {unschedulable > 0 && <SecondaryLine text={`${String(unschedulable)} unschedulable`} />}
    </>
  );
}
