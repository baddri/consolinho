import { List, ListItem } from '@patternfly/react-core';
import { NodeModel } from '@/shared/k8s';
import { DASH, DetailsItem, DetailsSubsection, Status } from '@/shared/ui';
import { ConditionsTable } from '../../components/ConditionsTable';
import { ResourceLink } from '../../components/ResourceLink';
import {
  machineInstanceType,
  machineNodeName,
  machinePhase,
  machineProviderState,
  machineRegion,
  machineRole,
  machineZone,
  type MachineResource,
} from './machine';

/**
 * Machine addresses as OCP `NodeIPList` (expanded), the same rendering as the Node overview's "Node addresses": one
 * `Type: address` line each, the type (camel case spaced, `Internal IP`) in subtle text, sorted by type.
 */
function MachineAddresses({ machine }: { machine: MachineResource }) {
  const addresses = (machine.status?.addresses ?? [])
    .filter((entry) => entry.address)
    .sort((a, b) => a.type.localeCompare(b.type));
  if (addresses.length === 0) return DASH;
  return (
    <List isPlain>
      {addresses.map(({ type, address }) => (
        <ListItem key={`${type}/${address}`}>
          <span className="pf-v6-u-text-color-subtle">{type.replace(/([a-z])([A-Z])/g, '$1 $2')}: </span>
          {address}
        </ListItem>
      ))}
    </List>
  );
}

/**
 * Right column of the Machine details, in OCP `MachineDetails` order: Phase, Provider state, then Node, Machine role,
 * Instance type, Region and Availability zone only when known, and Machine addresses.
 */
export function MachineDetailsList({ obj }: { obj: MachineResource }) {
  const phase = machinePhase(obj);
  const nodeName = machineNodeName(obj);
  const role = machineRole(obj);
  const instanceType = machineInstanceType(obj);
  const region = machineRegion(obj);
  const zone = machineZone(obj);
  return (
    <>
      <DetailsItem label="Phase" path="status.phase">
        {phase ? <Status status={phase} /> : DASH}
      </DetailsItem>
      <DetailsItem label="Provider state" path="status.providerStatus.instanceState">
        {machineProviderState(obj) ?? DASH}
      </DetailsItem>
      {nodeName && (
        <DetailsItem label="Node">
          <ResourceLink model={NodeModel} name={nodeName} />
        </DetailsItem>
      )}
      {role && <DetailsItem label="Machine role">{role}</DetailsItem>}
      {instanceType && <DetailsItem label="Instance type">{instanceType}</DetailsItem>}
      {region && <DetailsItem label="Region">{region}</DetailsItem>}
      {zone && <DetailsItem label="Availability zone">{zone}</DetailsItem>}
      <DetailsItem label="Machine addresses">
        <MachineAddresses machine={obj} />
      </DetailsItem>
    </>
  );
}

/** Section under the Machine details grid: the provider's Conditions (`status.providerStatus.conditions`). */
export function MachineSections({ obj }: { obj: MachineResource }) {
  return (
    <DetailsSubsection title="Conditions">
      <ConditionsTable conditions={obj.status?.providerStatus?.conditions} />
    </DetailsSubsection>
  );
}
