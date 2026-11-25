import type { ReactNode } from 'react';
import type { K8sModel } from '@/shared/k8s';
import { PageHeading } from '@/shared/ui';
import { KindBadge } from '../components/KindBadge';
import { ResourceStatusLabel } from '../components/ResourceStatusLabel';
import { resourcePath } from '../paths';
import type { BreadcrumbLabels, DetailsHeading, ResourceStatus } from '../registry/types';

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
  /** The descriptor's heading alert (OCP `DetailsPage` `helpAlert`), shown on every tab. */
  alert?: ReactNode;
  /** The breadcrumb's list link when it isn't the generic list page (descriptor `listPath`). */
  listTo?: string;
  /** Breadcrumb labels replacing `<Kinds>` / `<Kind> details` (descriptor `detailsCrumbs`). */
  crumbs?: BreadcrumbLabels;
  /** Logo + custom h1 content replacing the kind badge + name (descriptor `detailsHeading`, loaded object only). */
  heading?: DetailsHeading;
}

/**
 * Heading of a resource details page (`UX.md` §3, OCP `breadcrumbsForDetailsPage`): breadcrumb `<Kinds> › <Kind>
 * details` (the list in the object's namespace, the cluster-scoped list, or the descriptor's `listPath`; labels may be
 * overridden), kind badge + name as `h1` (or the descriptor's own logo + title, OCP `OverrideTitle`), the status as
 * an outlined label and the actions on the right. Rendered in every state of the page (loading, not found, errors).
 */
export function ResourceHeader({
  cluster,
  model,
  namespace,
  name,
  status,
  actions,
  alert,
  listTo,
  crumbs,
  heading,
}: ResourceHeaderProps) {
  return (
    <PageHeading
      breadcrumbs={[
        {
          label: crumbs?.list ?? model.labelPlural,
          to: listTo ?? resourcePath(cluster, model, { namespace }),
        },
        { label: crumbs?.details ?? `${model.label} details` },
      ]}
      leadIcon={heading?.leadIcon}
      titleCaption={heading?.caption}
      icon={heading ? undefined : <KindBadge model={model} size="lg" />}
      title={heading ? heading.title : name}
      status={status && <ResourceStatusLabel status={status} asLabel />}
      actions={actions}
      alert={alert}
    />
  );
}
