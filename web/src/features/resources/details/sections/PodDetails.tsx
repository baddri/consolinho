import {
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  Stack,
  StackItem,
  Title,
} from '@patternfly/react-core';
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import type { ReactNode } from 'react';
import type { Pod } from '@/shared/k8s';

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

/** One summary row of the pod's `DescriptionList`. */
function Item({ term, children }: { term: string; children: ReactNode }) {
  return (
    <DescriptionListGroup>
      <DescriptionListTerm>{term}</DescriptionListTerm>
      <DescriptionListDescription>{children}</DescriptionListDescription>
    </DescriptionListGroup>
  );
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

/**
 * Pod part of the Details tab (UI-4): phase, node, pod IP(s), QoS class and the containers table with state + reason,
 * restarts and the last termination — what you need to see why a pod crash-loops.
 */
export function PodDetails({ obj }: { obj: Pod }) {
  const podIPs = obj.status?.podIPs?.map(({ ip }) => ip) ?? (obj.status?.podIP ? [obj.status.podIP] : []);
  return (
    <Stack hasGutter>
      <StackItem>
        <DescriptionList aria-label="Pod status" isCompact isHorizontal>
          <Item term="Phase">{obj.status?.phase ?? 'Unknown'}</Item>
          <Item term="Node">{obj.spec?.nodeName ?? 'Not scheduled'}</Item>
          <Item term={podIPs.length > 1 ? 'Pod IPs' : 'Pod IP'}>{podIPs.join(', ') || '—'}</Item>
          <Item term="QoS class">{obj.status?.qosClass ?? '—'}</Item>
        </DescriptionList>
      </StackItem>
      <StackItem>
        <Title headingLevel="h3">Containers</Title>
      </StackItem>
      <StackItem>
        <ContainersTable pod={obj} />
      </StackItem>
    </Stack>
  );
}
