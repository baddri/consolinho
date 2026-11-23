import { ActionsColumn } from '@patternfly/react-table';
import { modelKey, type K8sResource } from '@/shared/k8s';
import type { ResourceDescriptor } from '../registry/types';
import { useResourceActions } from './useResourceActions';

/** Props for {@link ResourceRowActions}. */
export interface ResourceRowActionsProps {
  cluster: string;
  descriptor: ResourceDescriptor;
  obj: K8sResource;
}

/**
 * The kebab of a resource list row (UI-8; the list's data view renders the sticky action cell around it): the kind's
 * items, then Edit <Kind> and Delete <Kind>, from `useResourceActions` (keyed by the model: rules of hooks). The access check is namespace-level (no name), so rows of one namespace share
 * a single SelfSubjectAccessReview, and only rendered (current page) rows mount it. After a delete the list's watch
 * removes the row.
 */
export function ResourceRowActions(props: ResourceRowActionsProps) {
  return <RowActions key={modelKey(props.descriptor.model)} {...props} />;
}

function RowActions({ cluster, descriptor, obj }: ResourceRowActionsProps) {
  const { items, dialog } = useResourceActions({ cluster, descriptor, obj, reviewByName: false });
  return (
    <>
      <ActionsColumn items={items} />
      {dialog}
    </>
  );
}
