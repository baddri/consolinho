import { Content } from '@patternfly/react-core';
import { EnvironmentLabel } from '@/shared/ui';
import { useAccessibleCluster, useClusterDisplayName } from './useClusterDisplayName';

/** Props for {@link ClusterContextText}. */
export interface ClusterContextTextProps {
  cluster: string;
  /** Kind label shown before the object name, e.g. "Deployment". */
  kindLabel: string;
  objectName: string;
  /** Omitted for cluster-scoped objects. */
  namespace: string | undefined;
}

/**
 * The first line of every mutation modal (SAFE-1): which object the write targets and on which cluster —
 * "<Kind> <name> in <namespace> on **<display name>**" followed by the cluster's compact environment label, so a
 * production write is never anonymous.
 */
export function ClusterContextText({ cluster, kindLabel, objectName, namespace }: ClusterContextTextProps) {
  const entry = useAccessibleCluster(cluster);
  const displayName = useClusterDisplayName(cluster);
  return (
    <Content component="p">
      {kindLabel} {objectName}
      {namespace !== undefined && ` in ${namespace}`} on <strong>{displayName}</strong>
      {entry && (
        <>
          {' '}
          <EnvironmentLabel environment={entry.environment} isCompact />
        </>
      )}
    </Content>
  );
}
