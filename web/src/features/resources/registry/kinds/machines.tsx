import { MachineModel, NodeModel } from '@/shared/k8s';
import { DASH, Status } from '@/shared/ui';
import { ResourceLink } from '../../components/ResourceLink';
import { MachineDetailsList, MachineSections } from '../../compute/machines/MachineDetails';
import {
  machineNodeName,
  machinePhase,
  machineProviderState,
  machineRegion,
  machineZone,
  type MachineResource,
} from '../../compute/machines/machine';
import { nameColumn, namespaceColumn } from '../columns';
import type { ResourceDescriptor } from '../types';

export type { MachineResource };

/**
 * Machines (MS-1/2, OCP `machine.tsx` `MachinePage` / `MachineDetailsPage`), read-only (MS-3: OCP's Machine pages
 * offer no edits we support). List: Name, Namespace, Node (→ Node), Phase ("Provisioned as node" for Running),
 * Provider state, Region, Availability zone — OCP's columns, so no Created. Details: metadata left, Phase, Provider
 * state, Node, role, instance type, placement and Machine addresses right, then Conditions. The phase is also the
 * heading status (OCP `getResourceStatus`). A MachineSet's Machines tab reuses this descriptor.
 */
export const machineDescriptor: ResourceDescriptor<MachineResource> = {
  model: MachineModel,
  nav: { section: 'compute', order: 20 },
  readOnly: true,
  status: (machine) => {
    const phase = machinePhase(machine);
    return phase === undefined ? undefined : { title: phase };
  },
  DetailsSection: MachineDetailsList,
  ExtraSections: MachineSections,
  columns: [
    nameColumn(MachineModel),
    namespaceColumn(MachineModel),
    {
      id: 'node',
      title: 'Node',
      cell: (machine) => {
        const nodeName = machineNodeName(machine);
        return nodeName ? <ResourceLink model={NodeModel} name={nodeName} /> : DASH;
      },
      sortValue: (machine) => machineNodeName(machine) ?? null,
    },
    {
      id: 'phase',
      title: 'Phase',
      cell: (machine) => {
        const phase = machinePhase(machine);
        return phase ? <Status status={phase} /> : DASH;
      },
      sortValue: (machine) => machinePhase(machine) ?? null,
    },
    {
      id: 'providerState',
      title: 'Provider state',
      cell: (machine) => machineProviderState(machine) ?? DASH,
      sortValue: (machine) => machineProviderState(machine) ?? null,
    },
    {
      id: 'region',
      title: 'Region',
      cell: (machine) => machineRegion(machine) ?? DASH,
      sortValue: (machine) => machineRegion(machine) ?? null,
    },
    {
      id: 'zone',
      title: 'Availability zone',
      cell: (machine) => machineZone(machine) ?? DASH,
      sortValue: (machine) => machineZone(machine) ?? null,
    },
  ],
};
