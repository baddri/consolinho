import { Flex, FlexItem } from '@patternfly/react-core';
import { Link } from 'react-router';
import { useActiveCluster } from '@/features/cluster-context';
import type { K8sModel } from '@/shared/k8s';
import { resourcePath } from '../paths';
import { KindBadge } from './KindBadge';

/** Props for {@link ResourceLink}. */
export interface ResourceLinkProps {
  model: K8sModel;
  name: string;
  /** Namespace of a namespaced object; ignored for cluster-scoped kinds. */
  namespace?: string;
  /** Hide the kind badge (e.g. when the column already names the kind). */
  hideBadge?: boolean;
}

/**
 * Kind badge + link to an object's details page (OCP `ResourceLink`: badge and name on one line, a small gap, the
 * name wrapping only when the column is too narrow) on the active cluster (from the URL). The link's accessible name is
 * the object name. Namespaced objects without a namespace, or outside a cluster route, render as plain text.
 */
export function ResourceLink({ model, name, namespace, hideBadge = false }: ResourceLinkProps) {
  const cluster = useActiveCluster();
  const canLink = cluster !== undefined && (!model.namespaced || namespace !== undefined);
  return (
    <Flex gap={{ default: 'gapSm' }} flexWrap={{ default: 'nowrap' }} alignItems={{ default: 'alignItemsBaseline' }}>
      {!hideBadge && (
        <FlexItem flex={{ default: 'flexNone' }}>
          <KindBadge model={model} />
        </FlexItem>
      )}
      <FlexItem>
        {canLink ? <Link to={resourcePath(cluster, model, { namespace, name })}>{name}</Link> : name}
      </FlexItem>
    </Flex>
  );
}
