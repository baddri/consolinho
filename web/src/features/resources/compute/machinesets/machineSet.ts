import type { K8sResource, MachineSet } from '@/shared/k8s';

/** A listed MachineSet (`metadata` always present). */
export type MachineSetResource = MachineSet & K8sResource;

const CPU_ANNOTATION = 'machine.openshift.io/vCPU';
const MEMORY_ANNOTATION = 'machine.openshift.io/memoryMb';

/** `spec.replicas`, which defaults to 1 when unset (0 stays 0), as OCP `getDesiredReplicas`. */
export function desiredMachines(machineSet: MachineSet): number {
  return machineSet.spec?.replicas ?? 1;
}

/** `status.replicas`, `readyReplicas` and `availableReplicas`, 0 when unset (OCP `getReplicas` & co.). */
export function machineSetCounts(machineSet: MachineSet): { current: number; ready: number; available: number } {
  return {
    current: machineSet.status?.replicas ?? 0,
    ready: machineSet.status?.readyReplicas ?? 0,
    available: machineSet.status?.availableReplicas ?? 0,
  };
}

/** `n machine` / `n machines` (OCP's pluralised `{{count}} machine`). */
export function machineCountText(count: number): string {
  return `${String(count)} ${count === 1 ? 'machine' : 'machines'}`;
}

/**
 * The template's instance type, OCP `getMachineSetInstanceType`: the provider spec field differs per cloud (AWS
 * `instanceType`, Azure `vmSize`, GCP `machineType`, OpenStack `flavor`), so the first string set wins.
 */
export function machineSetInstanceType(machineSet: MachineSet): string | undefined {
  const value = machineSet.spec?.template?.spec?.providerSpec?.value;
  const candidates = [value?.instanceType, value?.vmSize, value?.machineType, value?.flavor];
  return candidates.find((candidate) => typeof candidate === 'string' && candidate !== '');
}

/** Region and availability zone of the template's AWS placement (MachineSets have no region/zone labels). */
export function machineSetPlacement(machineSet: MachineSet): { region?: string; zone?: string } {
  const placement = machineSet.spec?.template?.spec?.providerSpec?.value?.placement;
  const orUndefined = (value: string | undefined) => (value === '' ? undefined : value);
  return { region: orUndefined(placement?.region), zone: orUndefined(placement?.availabilityZone) };
}

/** A positive number from an annotation, or `undefined` when missing or malformed. */
function numberAnnotation(machineSet: K8sResource, key: string): number | undefined {
  const raw = machineSet.metadata.annotations?.[key];
  const value = raw === undefined || raw.trim() === '' ? NaN : Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

/** vCPUs per machine from the `machine.openshift.io/vCPU` capacity annotation the Machine API sets. */
export function machineSetCpu(machineSet: K8sResource): number | undefined {
  return numberAnnotation(machineSet, CPU_ANNOTATION);
}

/** Memory per machine in GiB from the `machine.openshift.io/memoryMb` capacity annotation (MiB, despite the name). */
export function machineSetMemoryGiB(machineSet: K8sResource): number | undefined {
  const mb = numberAnnotation(machineSet, MEMORY_ANNOTATION);
  return mb === undefined ? undefined : mb / 1024;
}

const NUMBER = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

/** OCP `CPUCell` copy: `8 cores`, `1 core`. */
export function cpuText(cores: number): string {
  return `${NUMBER.format(cores)} ${cores === 1 ? 'core' : 'cores'}`;
}

const MEMORY = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** OCP `MemoryCell` copy with its fixed 2 decimals (`humanizeBinaryBytes(…, 2)`): `32.00 GiB`. */
export function memoryText(gib: number): string {
  return `${MEMORY.format(gib)} GiB`;
}
