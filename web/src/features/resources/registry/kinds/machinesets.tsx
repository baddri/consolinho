import { MachineSetModel } from '@/shared/k8s';
import { DASH } from '@/shared/ui';
import { MachineCounts } from '../../compute/machinesets/MachineCounts';
import { MachinesCell, MachineSetSummaryRows } from '../../compute/machinesets/MachineSetDetails';
import { MachineSetMachinesTab } from '../../compute/machinesets/MachineSetMachinesTab';
import {
  cpuText,
  machineSetCounts,
  machineSetCpu,
  machineSetInstanceType,
  machineSetMemoryGiB,
  memoryText,
  type MachineSetResource,
} from '../../compute/machinesets/machineSet';
import { nameColumn, namespaceColumn } from '../columns';
import type { ResourceDescriptor } from '../types';

export type { MachineSetResource };

/**
 * MachineSets (MS-1/2, OCP `machine-set.tsx` `MachineSetPage` / `MachineSetDetailsPage`), read-only (MS-3, spec Q7:
 * no Edit machine count). List: Name, Namespace, Machines ("R of D machines" → Machines tab), Instance type, CPU and
 * Memory — OCP's columns, so no Created. CPU / Memory come from the Machine API's `vCPU` / `memoryMb` capacity
 * annotations rather than OCP's watch of every Machine and Node. Details: OCP `MachineCounts` above the grid,
 * Selector / Instance type / role / placement in the metadata column; tabs Details · YAML · Machines · Events.
 */
export const machineSetDescriptor: ResourceDescriptor<MachineSetResource> = {
  model: MachineSetModel,
  nav: { section: 'compute', order: 30 },
  readOnly: true,
  summary: { Extra: MachineSetSummaryRows },
  DetailsTop: MachineCounts,
  extraTabs: ['machines'],
  KindTabs: { machines: MachineSetMachinesTab },
  columns: [
    nameColumn(MachineSetModel),
    namespaceColumn(MachineSetModel),
    {
      id: 'machines',
      title: 'Machines',
      cell: (machineSet) => <MachinesCell obj={machineSet} />,
      sortValue: (machineSet) => machineSetCounts(machineSet).ready,
    },
    {
      id: 'instanceType',
      title: 'Instance type',
      cell: (machineSet) => machineSetInstanceType(machineSet) ?? DASH,
      sortValue: (machineSet) => machineSetInstanceType(machineSet) ?? null,
    },
    {
      id: 'cpu',
      title: 'CPU',
      cell: (machineSet) => {
        const cpu = machineSetCpu(machineSet);
        return cpu === undefined ? DASH : cpuText(cpu);
      },
      sortValue: (machineSet) => machineSetCpu(machineSet) ?? null,
    },
    {
      id: 'memory',
      title: 'Memory',
      cell: (machineSet) => {
        const memory = machineSetMemoryGiB(machineSet);
        return memory === undefined ? DASH : memoryText(memory);
      },
      sortValue: (machineSet) => machineSetMemoryGiB(machineSet) ?? null,
    },
  ],
};
