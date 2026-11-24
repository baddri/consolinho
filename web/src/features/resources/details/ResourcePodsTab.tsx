import { useResourceDataView } from '../list/ResourceDataView';
import { podDescriptor, podNodesDescriptor } from '../registry/kinds/pods';
import { useResourceDetails } from './detailsContext';

/**
 * Pods tab of a workload (OCP `/pods` tab of Deployments, ReplicaSets): the Pods list — same columns, filters and row
 * actions as the Pods page — restricted to the descriptor's `podsSelector` in the object's namespace, or the
 * descriptor's own `PodsTab` when a selector can't express its pods (CronJob). Lazy route module.
 */
export function ResourcePodsTab() {
  const { cluster, descriptor, obj } = useResourceDetails();
  return descriptor.PodsTab ? <descriptor.PodsTab cluster={cluster} obj={obj} /> : <SelectorPodsTab />;
}

/** The Pods list matching the descriptor's `podsSelector`; Node replaces Owner with `podsShowNodes` (OCP `showNodes`). */
function SelectorPodsTab() {
  const { cluster, descriptor, obj } = useResourceDetails();
  const { dataView } = useResourceDataView({
    descriptor: descriptor.podsShowNodes ? podNodesDescriptor : podDescriptor,
    cluster,
    scope: 'ns',
    namespace: obj.metadata.namespace,
    fixedSelector: descriptor.podsSelector?.(obj) ?? {},
  });
  return dataView;
}
