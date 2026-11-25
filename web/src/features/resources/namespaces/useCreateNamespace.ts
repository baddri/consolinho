import { useQueryClient } from '@tanstack/react-query';
import { k8sCreate, k8sQueryKeys, NamespaceModel, type K8sResource } from '@/shared/k8s';
import { labelsToMap } from '../actions/LabelsInput';
import { useResourceMutation } from '../actions/useResourceMutation';
import type { CreateNamespaceValues } from './createNamespaceSchema';

/** What {@link useCreateNamespace} sends; `namespace` is always `undefined` (namespaces are cluster-scoped). */
export interface CreateNamespaceVars extends CreateNamespaceValues {
  namespace: undefined;
}

/** The Namespace body; `metadata.labels` is left out when there are none. */
function namespaceObject({ name, labels }: CreateNamespaceVars): K8sResource {
  return {
    apiVersion: 'v1',
    kind: 'Namespace',
    metadata: { name, ...(labels.length > 0 ? { labels: labelsToMap(labels) } : {}) },
  };
}

/**
 * Creates a namespace on `cluster` the Kubernetes way (NSC-1, OCP `CreateNamespaceModal`): POST a `Namespace`. On
 * success the Namespaces list is invalidated (it also updates through its watch) and the toast names namespace and
 * cluster; failures (409 AlreadyExists, 403) stay inline in the modal. Mutation guard and audit come from the proxy.
 */
export function useCreateNamespace(cluster: string) {
  const queryClient = useQueryClient();
  return useResourceMutation(cluster, {
    model: NamespaceModel,
    mutationFn: async (vars: CreateNamespaceVars) => {
      const created = await k8sCreate<K8sResource>(cluster, NamespaceModel, undefined, namespaceObject(vars));
      void queryClient.invalidateQueries({ queryKey: k8sQueryKeys.list(cluster, NamespaceModel) });
      return created;
    },
    successMessage: ({ name }) => `Namespace ${name} created`,
  });
}
