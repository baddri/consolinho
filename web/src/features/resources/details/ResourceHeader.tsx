import { Breadcrumb, BreadcrumbItem, Flex, FlexItem, PageSection, Title } from '@patternfly/react-core';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import type { K8sModel } from '@/shared/k8s';
import { KindBadge } from '../components/KindBadge';
import { ResourceStatusLabel } from '../components/ResourceStatusLabel';
import { resourcePath } from '../paths';
import type { ResourceStatus } from '../registry/types';
import { useNamespaceModel } from './useNamespaceModel';

/** Props for {@link ResourceHeader}. */
export interface ResourceHeaderProps {
  cluster: string;
  model: K8sModel;
  /** Namespace of a namespaced object; `undefined` for cluster-scoped kinds. */
  namespace: string | undefined;
  /** Object name from the URL, so breadcrumb and title show while loading or not found. */
  name: string;
  /** The descriptor's status of the loaded object; no label without one. */
  status?: ResourceStatus;
  /** Right-aligned actions (T-0076: the Actions dropdown). */
  actions?: ReactNode;
}

/**
 * `Projects › <ns> › <Kinds> › <name>`, or `<Kinds> › <name>` for cluster-scoped kinds (spec §5). The items are direct
 * `BreadcrumbItem` children with no conditional gaps: `Breadcrumb` draws dividers by child index.
 */
function ResourceBreadcrumb({
  cluster,
  model,
  namespace,
  name,
}: Omit<ResourceHeaderProps, 'status' | 'actions'>) {
  const namespaceModel = useNamespaceModel(cluster);
  const links: { to: string; text: string }[] = [];
  if (model.namespaced && namespace !== undefined) {
    links.push(
      { to: resourcePath(cluster, namespaceModel), text: namespaceModel.labelPlural },
      { to: resourcePath(cluster, namespaceModel, { name: namespace }), text: namespace },
    );
  }
  links.push({ to: resourcePath(cluster, model, { namespace }), text: model.labelPlural });
  return (
    <Breadcrumb>
      {links.map(({ to, text }) => (
        <BreadcrumbItem
          key={to}
          render={({ className }) => (
            <Link className={className} to={to}>
              {text}
            </Link>
          )}
        />
      ))}
      <BreadcrumbItem isActive>{name}</BreadcrumbItem>
    </Breadcrumb>
  );
}

/**
 * Header of a resource details page (spec §5): breadcrumb, then kind badge + name as `h1` + status label, with an
 * actions slot on the right. Rendered in every state of the page (loading, not found, errors).
 */
export function ResourceHeader({ cluster, model, namespace, name, status, actions }: ResourceHeaderProps) {
  return (
    <PageSection>
      <ResourceBreadcrumb cluster={cluster} model={model} namespace={namespace} name={name} />
      <Flex
        justifyContent={{ default: 'justifyContentSpaceBetween' }}
        alignItems={{ default: 'alignItemsCenter' }}
      >
        <Flex spaceItems={{ default: 'spaceItemsSm' }} alignItems={{ default: 'alignItemsCenter' }}>
          <FlexItem>
            <KindBadge model={model} />
          </FlexItem>
          <FlexItem>
            <Title headingLevel="h1">{name}</Title>
          </FlexItem>
          {status && (
            <FlexItem>
              <ResourceStatusLabel status={status} />
            </FlexItem>
          )}
        </Flex>
        {actions && <FlexItem>{actions}</FlexItem>}
      </Flex>
    </PageSection>
  );
}
