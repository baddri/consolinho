import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import type { Pod } from '@/shared/k8s';
import { DetailsItem } from '@/shared/ui';
import { ResourceStatusLabel } from '../../components/ResourceStatusLabel';
import type { ResourceStatus } from '../../registry/types';
import { DetailsSubsection } from './DetailsSubsection';

type ContainerStatus = NonNullable<NonNullable<Pod['status']>['containerStatuses']>[number];
type ContainerState = NonNullable<ContainerStatus['state']>;

/** "Running", "Waiting: CrashLoopBackOff", "Terminated: Completed" — a container state with its reason. */
export function containerStateText(state: ContainerState | undefined): string {
  if (state?.running) return 'Running';
  if (state?.waiting) return state.waiting.reason ? `Waiting: ${state.waiting.reason}` : 'Waiting';
  if (state?.terminated)
    return state.terminated.reason ? `Terminated: ${state.terminated.reason}` : 'Terminated';
  return 'Unknown';
}

/** Reason and exit code of the container's previous run ("Error, exit code 1"); "—" if it never terminated. */
function lastTermination(status: ContainerStatus | undefined): string {
  const terminated = status?.lastState?.terminated;
  if (!terminated) return '—';
  return `${terminated.reason ?? 'Terminated'}, exit code ${String(terminated.exitCode)}`;
}

/** Containers table: spec order, joined with their statuses by name. */
function ContainersTable({ pod }: { pod: Pod }) {
  const statuses = new Map((pod.status?.containerStatuses ?? []).map((status) => [status.name, status]));
  return (
    <Table aria-label="Containers" variant="compact">
      <Thead>
        <Tr>
          <Th>Name</Th>
          <Th>Image</Th>
          <Th>State</Th>
          <Th>Ready</Th>
          <Th>Restarts</Th>
          <Th>Last termination</Th>
        </Tr>
      </Thead>
      <Tbody>
        {(pod.spec?.containers ?? []).map((container) => {
          const status = statuses.get(container.name);
          return (
            <Tr key={container.name}>
              <Td dataLabel="Name">{container.name}</Td>
              <Td dataLabel="Image" modifier="breakWord">
                {container.image ?? '—'}
              </Td>
              <Td dataLabel="State">{containerStateText(status?.state)}</Td>
              <Td dataLabel="Ready">{status?.ready ? 'Yes' : 'No'}</Td>
              <Td dataLabel="Restarts">{status?.restartCount ?? 0}</Td>
              <Td dataLabel="Last termination">{lastTermination(status)}</Td>
            </Tr>
          );
        })}
      </Tbody>
    </Table>
  );
}

/** Props for {@link PodDetails}. */
export interface PodDetailsProps {
  obj: Pod;
  /** The descriptor's pod status (same as the title's), passed in so this module needn't import the descriptor. */
  status: ResourceStatus;
}

/**
 * Pod fields of the Details tab's right column (UI-4): status as icon + text (OCP `PodDetailsList`, matching the
 * title, so a crash-looping pod never reads "Running"), node, pod IP(s) and QoS class.
 */
export function PodDetails({ obj, status }: PodDetailsProps) {
  const podIPs = obj.status?.podIPs?.map(({ ip }) => ip) ?? (obj.status?.podIP ? [obj.status.podIP] : []);
  return (
    <>
      <DetailsItem label="Status">
        <ResourceStatusLabel status={status} />
      </DetailsItem>
      <DetailsItem label="Node">{obj.spec?.nodeName ?? 'Not scheduled'}</DetailsItem>
      <DetailsItem label={podIPs.length > 1 ? 'Pod IPs' : 'Pod IP'}>{podIPs.join(', ') || '—'}</DetailsItem>
      <DetailsItem label="QoS class">{obj.status?.qosClass ?? '—'}</DetailsItem>
    </>
  );
}

/**
 * Containers section below the pod's details grid (UI-4): state + reason, restarts and the last termination — what you
 * need to see why a pod crash-loops.
 */
export function PodContainers({ obj }: { obj: Pod }) {
  return (
    <DetailsSubsection title="Containers">
      <ContainersTable pod={obj} />
    </DetailsSubsection>
  );
}
