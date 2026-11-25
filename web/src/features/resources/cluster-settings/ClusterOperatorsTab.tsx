import { Alert } from '@patternfly/react-core';
import type { ClusterVersion } from '@/shared/k8s';
import { useResourceDataView } from '../list/ResourceDataView';
import { clusterOperatorDescriptor } from '../registry/kinds/clusteroperators';
import { useClusterSettings } from './clusterSettingsContext';
import { clusterUpdateView } from './clusterUpdateView';

/**
 * OCP `UpdateInProgressAlert`: while the cluster updates, an info alert over the operator list naming the target
 * version, with the Progressing message as its body.
 */
function UpdateInProgressAlert({ cv }: { cv: ClusterVersion | undefined }) {
  const update = cv && clusterUpdateView(cv);
  if (update?.kind !== 'updating') return null;
  return (
    <Alert
      isInline
      variant="info"
      className="pf-v6-u-mb-md"
      title={update.version ? `Update to ${update.version} in progress` : 'Update in progress'}
    >
      {update.progress}
    </Alert>
  );
}

/**
 * ClusterOperators tab of Cluster Settings (CS-3, OCP `ClusterOperatorTabPage`): the registry's ClusterOperator list
 * (columns, Status filter, default sort by name) embedded without a heading, like the Pods tab embeds the Pods list.
 * A forbidden list shows the list's own "Restricted access" state. Lazy route module.
 */
export function ClusterOperatorsTab() {
  const { cluster, clusterVersion } = useClusterSettings();
  const { dataView } = useResourceDataView({
    descriptor: clusterOperatorDescriptor,
    cluster,
    scope: 'cluster',
    namespace: undefined,
  });
  return (
    <>
      <UpdateInProgressAlert cv={clusterVersion.error ? undefined : clusterVersion.data} />
      {dataView}
    </>
  );
}
