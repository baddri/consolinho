import { MachineSetModel, type MachineSet } from '@/shared/k8s';
import { ageColumn, nameColumn, namespaceColumn } from '../columns';
import type { ResourceDescriptor } from '../types';

/**
 * MachineSets (Compute → MachineSets, OCP `machine-set.tsx`), read-only (MS-3). Minimal CP5b foundation descriptor
 * (T-0331): Name, Namespace and Created; columns, details and the Machines tab (`extraTabs` + `KindTabs.machines`)
 * are filled in by T-0334.
 */
export const machineSetDescriptor: ResourceDescriptor<MachineSet> = {
  model: MachineSetModel,
  nav: { section: 'compute', order: 30 },
  readOnly: true,
  columns: [nameColumn(MachineSetModel), namespaceColumn(MachineSetModel), ageColumn()],
};
