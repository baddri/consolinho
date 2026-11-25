import { MachineModel, type Machine } from '@/shared/k8s';
import { ageColumn, nameColumn, namespaceColumn } from '../columns';
import type { ResourceDescriptor } from '../types';

/**
 * Machines (Compute → Machines, OCP `machine.tsx`), read-only as in OCP's admin flows (MS-3). Minimal CP5b
 * foundation descriptor (T-0331): Name, Namespace and Created; columns, details and status are filled in by T-0334.
 */
export const machineDescriptor: ResourceDescriptor<Machine> = {
  model: MachineModel,
  nav: { section: 'compute', order: 20 },
  readOnly: true,
  columns: [nameColumn(MachineModel), namespaceColumn(MachineModel), ageColumn()],
};
