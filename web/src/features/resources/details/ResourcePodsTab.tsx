import { EmptyState } from '@patternfly/react-core';
import { PodModel, type LabelSelector } from '@/shared/k8s';
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

/**
 * The Pods list matching the descriptor's `podsSelector`. An `undefined` selector (a Service without `spec.selector`)
 * selects no pods: it shows the Pods list's empty state instead of listing the whole namespace.
 */
function SelectorPodsTab() {
  const { descriptor, obj } = useResourceDetails();
  const selector = descriptor.podsSelector?.(obj);
  return selector === undefined ? (
    <EmptyState variant="sm" titleText={`No ${PodModel.labelPlural} found`} headingLevel="h2" />
  ) : (
    <SelectedPods selector={selector} />
  );
}

/** The live Pods list of `selector` in the object's namespace; Node replaces Owner with `podsShowNodes` (OCP `showNodes`). */
function SelectedPods({ selector }: { selector: LabelSelector }) {
  const { cluster, descriptor, obj } = useResourceDetails();
  const { dataView } = useResourceDataView({
    descriptor: descriptor.podsShowNodes ? podNodesDescriptor : podDescriptor,
    cluster,
    scope: 'ns',
    namespace: obj.metadata.namespace,
    fixedSelector: selector,
  });
  return dataView;
}
