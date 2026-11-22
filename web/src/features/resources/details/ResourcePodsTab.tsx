import { useResourceDataView } from '../list/ResourceDataView';
import { podDescriptor } from '../registry/kinds/pods';
import { useResourceDetails } from './detailsContext';

/**
 * Pods tab of a workload (OCP `/pods` tab of Deployments, ReplicaSets): the Pods list — same columns, filters and row
 * actions as the Pods page — restricted to the descriptor's `podsSelector` in the object's namespace. Lazy route module.
 */
export function ResourcePodsTab() {
  const { cluster, descriptor, obj } = useResourceDetails();
  const { dataView } = useResourceDataView({
    descriptor: podDescriptor,
    cluster,
    scope: 'ns',
    namespace: obj.metadata.namespace,
    fixedSelector: descriptor.podsSelector?.(obj) ?? {},
  });
  return dataView;
}
