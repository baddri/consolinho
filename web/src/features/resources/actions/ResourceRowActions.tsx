import { ActionsColumn, Td } from '@patternfly/react-table';
import type { K8sResource } from '@/shared/k8s';
import type { ResourceDescriptor } from '../registry/types';
import { useResourceActions } from './useResourceActions';

/** Props for {@link ResourceRowActions}. */
export interface ResourceRowActionsProps {
  cluster: string;
  descriptor: ResourceDescriptor;
  obj: K8sResource;
}

/**
 * The kebab cell of a resource list row (UI-8): Edit YAML and Delete from `useResourceActions`. The access check is
 * namespace-level (no name), so rows of one namespace share a single SelfSubjectAccessReview, and only rendered
 * (current page) rows mount it. After a delete the list's watch removes the row.
 */
export function ResourceRowActions({ cluster, descriptor, obj }: ResourceRowActionsProps) {
  const name = obj.metadata.name ?? '';
  const { items, dialog } = useResourceActions({
    cluster,
    descriptor,
    namespace: obj.metadata.namespace,
    name,
    reviewByName: false,
  });
  return (
    <Td isActionCell>
      <ActionsColumn items={items} />
      {dialog}
    </Td>
  );
}
