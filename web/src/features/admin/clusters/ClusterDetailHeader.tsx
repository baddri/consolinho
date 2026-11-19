import {
  Breadcrumb,
  BreadcrumbItem,
  Content,
  Flex,
  FlexItem,
  Label,
  LabelGroup,
  PageSection,
  Skeleton,
  Title,
} from '@patternfly/react-core';
import { Link } from 'react-router';
import type { ClusterDetail } from '@/shared/api';
import { EnvironmentLabel } from '@/shared/ui';
import { ClusterActionsDropdown } from './ClusterActionsDropdown';
import type { ClusterActionsOptions } from './useClusterActions';
import { TLS_MODE_TEXT } from './TlsModeLabel';

/** Breadcrumb "Clusters › name"; the first crumb is a client-side router link. */
function ClusterBreadcrumb({ name }: { name: string }) {
  return (
    <Breadcrumb>
      <BreadcrumbItem
        render={({ className }) => (
          <Link className={className} to="/admin/clusters">
            Clusters
          </Link>
        )}
      />
      <BreadcrumbItem isActive>{name}</BreadcrumbItem>
    </Breadcrumb>
  );
}

/** Environment, "Disabled" and "TLS not verified" labels; they follow the cached detail, so enable/disable updates them. */
function ClusterHeaderLabels({ cluster }: { cluster: ClusterDetail }) {
  return (
    <LabelGroup aria-label="Cluster labels" numLabels={3}>
      <EnvironmentLabel environment={cluster.environment} />
      {!cluster.isEnabled && <Label color="grey">Disabled</Label>}
      {cluster.tlsMode === 'skipVerify' && (
        <Label status="warning">
          {TLS_MODE_TEXT.skipVerify}
        </Label>
      )}
    </LabelGroup>
  );
}

/** Props for {@link ClusterDetailHeader}. */
export interface ClusterDetailHeaderProps extends ClusterActionsOptions {
  /** Cluster name from the route; shown in breadcrumb and title even while loading or not found. */
  name: string;
  /** The loaded cluster; without one there are no labels and no actions. */
  cluster?: ClusterDetail;
  /** The cluster is still loading: show a skeleton in place of display name and labels. */
  isLoading: boolean;
}

/**
 * Header of the cluster detail page (CLU-8): breadcrumb Clusters › name, the name as `h1` with the environment,
 * "Disabled" and "TLS not verified" labels, the display name below (when it differs from the name) and the Actions
 * menu ({@link ClusterActionsDropdown}). While loading it shows a skeleton; after a failure only breadcrumb and title.
 */
export function ClusterDetailHeader({ name, cluster, isLoading, onDeleted, onGone }: ClusterDetailHeaderProps) {
  return (
    <PageSection>
      <ClusterBreadcrumb name={name} />
      <Flex justifyContent={{ default: 'justifyContentSpaceBetween' }} alignItems={{ default: 'alignItemsFlexStart' }}>
        <FlexItem>
          <Flex spaceItems={{ default: 'spaceItemsMd' }} alignItems={{ default: 'alignItemsCenter' }}>
            <FlexItem>
              <Title headingLevel="h1">{name}</Title>
            </FlexItem>
            {cluster && (
              <FlexItem>
                <ClusterHeaderLabels cluster={cluster} />
              </FlexItem>
            )}
          </Flex>
          {cluster && cluster.displayName !== cluster.name && <Content component="p">{cluster.displayName}</Content>}
          {isLoading && <Skeleton width="15rem" screenreaderText="Loading cluster details" />}
        </FlexItem>
        {cluster && (
          <FlexItem>
            <ClusterActionsDropdown cluster={cluster} onDeleted={onDeleted} onGone={onGone} />
          </FlexItem>
        )}
      </Flex>
    </PageSection>
  );
}
