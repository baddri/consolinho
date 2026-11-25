import { useResourceDataView } from '../../list/ResourceDataView';
import { machineDescriptor } from '../../registry/kinds/machines';
import type { MachineSetResource } from './machineSet';

/**
 * Machines tab of a MachineSet (OCP `MachineTabPage`): the Machines list (same columns and filters as the Machines
 * page) of the set's namespace, limited to its `spec.selector`, as OCP. Without a selector a set owns nothing, so an
 * empty selector would list every machine: OCP shows them all too, the API rejects such sets anyway.
 */
export function MachineSetMachinesTab({ cluster, obj }: { cluster: string; obj: MachineSetResource }) {
  const { dataView } = useResourceDataView({
    descriptor: machineDescriptor,
    cluster,
    scope: 'ns',
    namespace: obj.metadata.namespace,
    fixedSelector: obj.spec?.selector ?? {},
  });
  return dataView;
}
