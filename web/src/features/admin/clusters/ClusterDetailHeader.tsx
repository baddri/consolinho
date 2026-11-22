import { Label, LabelGroup, Skeleton } from '@patternfly/react-core';
import type { ClusterDetail } from '@/shared/api';
import { EnvironmentLabel, KindBadge, PageHeading } from '@/shared/ui';
import { ADMIN_KIND_ABBR } from '../AdminResourceLink';
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
 * details`, the large "C" kind badge and the name as `h1`, the Enabled / Disabled status in a read `Badge`, the
 * compact environment and "TLS not verified" labels and the Actions menu ({@link ClusterActionsDropdown}) on the
 * right. No subtitle, as OCP: the display name is in the Details tab. Status and labels follow the cached detail, so
 * enable/disable updates them.
 */
export function ClusterDetailHeader({ name, cluster, isLoading, onDeleted, onGone }: ClusterDetailHeaderProps) {
  return (
    <PageHeading
      breadcrumbs={BREADCRUMBS}
      icon={<KindBadge kind="Cluster" abbr={ADMIN_KIND_ABBR.Cluster} size="lg" />}
      title={name}
      status={
        isLoading ? (
          <Skeleton width="10rem" screenreaderText="Loading cluster details" />
        ) : (
          cluster && <ClusterStatusLabel isEnabled={cluster.isEnabled} asLabel />
        )
      }
      labels={cluster && <ClusterHeaderLabels cluster={cluster} />}
      actions={cluster && <ClusterActionsDropdown cluster={cluster} onDeleted={onDeleted} onGone={onGone} />}
    />
  );
}
