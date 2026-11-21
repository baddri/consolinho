import { Label, LabelGroup, Skeleton } from '@patternfly/react-core';
import type { ClusterDetail } from '@/shared/api';
import { EnvironmentLabel, PageHeading } from '@/shared/ui';
import { ClusterActionsDropdown } from './ClusterActionsDropdown';
import { ClusterStatusLabel } from './ClusterStatusLabel';
import type { ClusterActionsOptions } from './useClusterActions';
import { TLS_MODE_TEXT } from './TlsModeLabel';

/** Breadcrumb of every state of the page (`UX.md` §3): `Clusters › Cluster details`. */
const BREADCRUMBS = [{ label: 'Clusters', to: '/admin/clusters' }, { label: 'Cluster details' }];

/** Compact environment and "TLS not verified" labels; they follow the cached detail. */
function ClusterHeaderLabels({ cluster }: { cluster: ClusterDetail }) {
  return (
    <LabelGroup aria-label="Cluster labels">
      <EnvironmentLabel environment={cluster.environment} isCompact />
      {cluster.tlsMode === 'skipVerify' && (
        <Label status="warning" isCompact>
          {TLS_MODE_TEXT.skipVerify}
        </Label>
      )}
    </LabelGroup>
  );
}

/** Props for {@link ClusterDetailHeader}. */
export interface ClusterDetailHeaderProps extends ClusterActionsOptions {
  /** Cluster name from the route; the title even while loading or not found. */
  name: string;
  /** The loaded cluster; without one there are no status, labels or actions. */
  cluster?: ClusterDetail;
  /** The cluster is still loading: show a skeleton in place of status and labels. */
  isLoading: boolean;
}

/**
 * Heading of the cluster detail page (CLU-8, `UX.md` §3) via {@link PageHeading}: breadcrumb `Clusters › Cluster
 * details`, the name as `h1` with the Enabled / Disabled status as an outlined label, the compact environment and
 * "TLS not verified" labels, the display name as subtitle (when it differs from the name) and the Actions menu
 * ({@link ClusterActionsDropdown}) on the right. Status and labels follow the cached detail, so enable/disable updates
 * them.
 */
export function ClusterDetailHeader({ name, cluster, isLoading, onDeleted, onGone }: ClusterDetailHeaderProps) {
  return (
    <PageHeading
      breadcrumbs={BREADCRUMBS}
      title={name}
      status={
        isLoading ? (
          <Skeleton width="10rem" screenreaderText="Loading cluster details" />
        ) : (
          cluster && <ClusterStatusLabel isEnabled={cluster.isEnabled} asLabel />
        )
      }
      labels={cluster && <ClusterHeaderLabels cluster={cluster} />}
      subtitle={cluster && cluster.displayName !== cluster.name ? cluster.displayName : undefined}
      actions={cluster && <ClusterActionsDropdown cluster={cluster} onDeleted={onDeleted} onGone={onGone} />}
    />
  );
}
