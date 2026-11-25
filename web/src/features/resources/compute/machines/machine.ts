import type { K8sResource, Machine } from '@/shared/k8s';

/** A listed Machine (`metadata` always present). */
export type MachineResource = Machine & K8sResource;

const ROLE_LABEL = 'machine.openshift.io/cluster-api-machine-role';
const INSTANCE_TYPE_LABEL = 'machine.openshift.io/instance-type';
const REGION_LABEL = 'machine.openshift.io/region';
const ZONE_LABEL = 'machine.openshift.io/zone';

/**
 * The machine's phase as OCP `getMachinePhase` shows it: `Running` reads "Provisioned as node" (a success status),
 * every other phase (Provisioning, Provisioned, Failed, Deleting) as is; `undefined` before the controller sets one.
 */
export function machinePhase(machine: Machine): string | undefined {
  const phase = machine.status?.phase;
  return phase === 'Running' ? 'Provisioned as node' : phase;
}

/** The Node the machine became (`status.nodeRef.name`, OCP `getMachineNodeName`). */
export function machineNodeName(machine: Machine): string | undefined {
  return machine.status?.nodeRef?.name;
}

/**
 * The cloud instance state (`status.providerStatus.instanceState`, e.g. `running`). Provider-specific, so read
 * defensively: absent on bare-metal and some providers.
 */
export function machineProviderState(machine: Machine): string | undefined {
  const providerStatus = machine.status?.providerStatus;
  const state = providerStatus && 'instanceState' in providerStatus ? providerStatus.instanceState : undefined;
  return typeof state === 'string' ? state : undefined;
}

/** Machine role label (`worker`, `master`), OCP `getMachineRole`; also read from a MachineSet's own labels. */
export function machineRole(obj: K8sResource): string | undefined {
  return obj.metadata.labels?.[ROLE_LABEL];
}

/** Instance type label of a Machine (OCP `getMachineInstanceType`). */
export function machineInstanceType(machine: K8sResource): string | undefined {
  return machine.metadata.labels?.[INSTANCE_TYPE_LABEL];
}

/** Region label of a Machine (OCP `getMachineRegion`). */
export function machineRegion(machine: K8sResource): string | undefined {
  return machine.metadata.labels?.[REGION_LABEL];
}

/** Availability zone label of a Machine (OCP `getMachineZone`). */
export function machineZone(machine: K8sResource): string | undefined {
  return machine.metadata.labels?.[ZONE_LABEL];
}
