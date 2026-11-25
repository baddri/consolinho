import { Flex, FlexItem } from '@patternfly/react-core';
import { isValidElement, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useActiveCluster } from '@/features/cluster-context';
import type { K8sModel } from '@/shared/k8s';
import { resourcePath } from '../paths';
import { KindBadge } from './KindBadge';
import styles from './ResourceLink.module.css';

/** Props for {@link BadgedName}. */
export interface BadgedNameProps {
  /** Kind shown as the badge; none renders the name alone. */
  badge?: Pick<K8sModel, 'abbr' | 'kind'>;
  /** The name: a router link or plain text. */
  children: ReactNode;
}

/**
 * OCP `ResourceLink` layout (`co-resource-item`) without the routing: kind badge (its own 4px right margin) and name
 * on one line, baseline-aligned, the name wrapping only when its column is too narrow and allows it. As OCP, the name
 * element (the link) is a direct flex child, so it is blockified to a full 21px line box under PF's dashed underline;
 * plain text gets a `span`. Used for links whose target isn't the object's details page (namespace column) and for
 * kinds the registry doesn't know (owner `ReplicaSet`).
 */
export function BadgedName({ badge, children }: BadgedNameProps) {
  return (
    <Flex
      gap={{ default: 'gapNone' }}
      flexWrap={{ default: 'nowrap' }}
      alignItems={{ default: 'alignItemsBaseline' }}
      className={styles.resourceItem}
    >
      {badge && (
        <FlexItem flex={{ default: 'flexNone' }}>
          <KindBadge model={badge} />
        </FlexItem>
      )}
      {isValidElement(children) ? children : <span>{children}</span>}
    </Flex>
  );
}

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
 * Kind badge + link to an object's details page ({@link BadgedName} layout, OCP `ResourceLink`) on the active cluster (from the URL). The link's accessible name is
 * the object name. Namespaced objects without a namespace, or outside a cluster route, render as plain text.
 */
export function ResourceLink({ model, name, namespace, hideBadge = false }: ResourceLinkProps) {
  const cluster = useActiveCluster();
  const canLink = cluster !== undefined && (!model.namespaced || namespace !== undefined);
  return (
    <BadgedName badge={hideBadge ? undefined : model}>
      {canLink ? <Link to={resourcePath(cluster, model, { namespace, name })}>{name}</Link> : name}
    </BadgedName>
  );
}
