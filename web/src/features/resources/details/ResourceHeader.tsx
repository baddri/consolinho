import type { ReactNode } from 'react';
import type { K8sModel } from '@/shared/k8s';
import { PageHeading } from '@/shared/ui';
import { KindBadge } from '../components/KindBadge';
import { ResourceStatusLabel } from '../components/ResourceStatusLabel';
import { resourcePath } from '../paths';
import type { ResourceStatus } from '../registry/types';

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
 * Heading of a resource details page (`UX.md` §3, OCP `breadcrumbsForDetailsPage`): breadcrumb `<Kinds> › <Kind>
 * details` (the list in the object's namespace, or the cluster-scoped list), kind badge + name as `h1`, the status as
 * an outlined label and the actions on the right. Rendered in every state of the page (loading, not found, errors).
 */
export function ResourceHeader({ cluster, model, namespace, name, status, actions }: ResourceHeaderProps) {
  return (
    <PageHeading
      breadcrumbs={[
        { label: model.labelPlural, to: resourcePath(cluster, model, { namespace }) },
        { label: `${model.label} details` },
      ]}
      icon={<KindBadge model={model} size="lg" />}
      title={name}
      status={status && <ResourceStatusLabel status={status} asLabel />}
      actions={actions}
    />
  );
}
