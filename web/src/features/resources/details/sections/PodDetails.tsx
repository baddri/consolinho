import { List, ListItem } from '@patternfly/react-core';
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import type { ReactNode } from 'react';
import type { Pod } from '@/shared/k8s';
import { DetailsItem, DetailsSubsection, Status, Timestamp } from '@/shared/ui';
import { ConditionsTable } from '../../components/ConditionsTable';
import { ObjectReferenceLink } from '../../components/ObjectReferenceLink';
import { BadgedName } from '../../components/ResourceLink';
import { VolumesTable } from '../../components/VolumesTable';

type ContainerStatus = NonNullable<NonNullable<Pod['status']>['containerStatuses']>[number];
type ContainerState = NonNullable<ContainerStatus['state']>;

/** OCP `getRestartPolicyLabel` (`public/module/k8s/pods.ts`). */
const RESTART_POLICIES: Readonly<Record<string, string>> = {
  Always: 'Always restart',
  OnFailure: 'Restart on failure',
  Never: 'Never restart',
};

/** "Running", "Waiting", "Terminated" — OCP `getContainerState` (`_.startCase` of the state key); "Unknown" without. */
export function containerStateText(state: ContainerState | undefined): string {
  if (state?.running) return 'Running';
  if (state?.waiting) return 'Waiting';
  if (state?.terminated) return 'Terminated';
  return 'Unknown';
}

/** OCP `ContainerLastState`: "Terminated at <time> with exit code 1 (Error)", "Waiting <reason>"; "-" without. */
function LastState({ status }: { status: ContainerStatus | undefined }) {
  const last = status?.lastState;
  if (last?.waiting) return <>Waiting {last.waiting.reason}</>;
  if (last?.running) return <>Running</>;
  if (last?.terminated) {
    const { exitCode, reason } = last.terminated;
    return (
      <>
        Terminated
        {exitCode ? ` with exit code ${String(exitCode)}` : ''}
        {reason ? ` (${reason})` : ''}
      </>
    );
  }
  return <>-</>;
}

type Container = NonNullable<Pod['spec']>['containers'][number];

/** Containers table, as OCP `PodContainerTable` (`pod.tsx`): spec order, joined with their statuses by name. */
function PodContainersTable({
  label,
  containers,
  containerStatuses,
}: {
  label: string;
  containers: readonly Container[];
  containerStatuses: readonly ContainerStatus[] | undefined;
}) {
  const statuses = new Map((containerStatuses ?? []).map((status) => [status.name, status]));
  return (
    <Table aria-label={label} gridBreakPoint="">
      <Thead>
        <Tr>
          <Th width={20}>Name</Th>
          <Th>Image</Th>
          <Th visibility={['hidden', 'visibleOnMd']}>State</Th>
          <Th visibility={['hidden', 'visibleOnMd']}>Ready</Th>
          <Th visibility={['hidden', 'visibleOnXl']}>Last State</Th>
          <Th visibility={['hidden', 'visibleOnLg']}>Restarts</Th>
          <Th width={10} visibility={['hidden', 'visibleOnLg']}>
            Started
          </Th>
          <Th width={10} visibility={['hidden', 'visibleOnXl']}>
            Finished
          </Th>
          <Th visibility={['hidden', 'visibleOnXl']}>Exit code</Th>
        </Tr>
      </Thead>
      <Tbody>
        {containers.map((container) => {
          const status = statuses.get(container.name);
          const state = status?.state;
          const startedAt =
            state?.running?.startedAt ??
            state?.terminated?.startedAt ??
            status?.lastState?.running?.startedAt ??
            status?.lastState?.terminated?.startedAt;
          const finishedAt = state?.terminated?.finishedAt ?? status?.lastState?.terminated?.finishedAt;
          return (
            <Tr key={container.name}>
              <Td dataLabel="Name" width={20}>
                {container.name}
              </Td>
              <Td dataLabel="Image" modifier="truncate">
                {container.image ?? '-'}
              </Td>
              <Td dataLabel="State" visibility={['hidden', 'visibleOnMd']}>
                <Status status={containerStateText(state)} />
              </Td>
              <Td dataLabel="Ready" visibility={['hidden', 'visibleOnMd']}>
                {status?.ready ? 'Ready' : 'Not ready'}
              </Td>
              <Td dataLabel="Last State" visibility={['hidden', 'visibleOnXl']}>
                <LastState status={status} />
              </Td>
              <Td dataLabel="Restarts" visibility={['hidden', 'visibleOnLg']}>
                {status?.restartCount ?? 0}
              </Td>
              <Td dataLabel="Started" width={10} visibility={['hidden', 'visibleOnLg']}>
                <Timestamp value={startedAt} />
              </Td>
              <Td dataLabel="Finished" width={10} visibility={['hidden', 'visibleOnXl']}>
                <Timestamp value={finishedAt} />
              </Td>
              <Td dataLabel="Exit code" visibility={['hidden', 'visibleOnXl']}>
                {state?.terminated?.exitCode ?? '-'}
              </Td>
            </Tr>
          );
        })}
      </Tbody>
    </Table>
  );
}

/** "a, b" of `ips`, or the single `ip`; "" without (OCP shows an empty value). */
function ipsText(ips: { ip?: string }[] | undefined, ip: string | undefined): string {
  return ips && ips.length > 1 ? ips.map((entry) => entry.ip).join(', ') : (ip ?? '');
}

/** Props for {@link PodDetails}. */
export interface PodDetailsProps {
  obj: Pod;
  /** The rendered pod status (OCP `PodStatus`), passed in so this module needn't import the descriptor. */
  status: ReactNode;
}

/**
 * Pod fields of the Details tab's right column, in OCP `PodDetailsList` order (`pod.tsx`): Status (icon + text,
 * matching the title), Restart policy, Active deadline seconds, Pod IP(s), Host IP(s), Node (hidden while unscheduled;
 * no Nodes page yet, so plain text with the `N` badge) and Image pull secret(s).
 */
export function PodDetails({ obj, status }: PodDetailsProps) {
  const podIPs = obj.status?.podIPs;
  const hostIPs = obj.status?.hostIPs;
  const deadline = obj.spec?.activeDeadlineSeconds;
  const pullSecrets = obj.spec?.imagePullSecrets ?? [];
  return (
    <>
      <DetailsItem label="Status">
        {status}
      </DetailsItem>
      <DetailsItem label="Restart policy" path="spec.restartPolicy">
        {RESTART_POLICIES[obj.spec?.restartPolicy ?? 'Always'] ?? obj.spec?.restartPolicy}
      </DetailsItem>
      <DetailsItem label="Active deadline seconds" path="spec.activeDeadlineSeconds">
        {deadline ? `${String(deadline)} ${deadline === 1 ? 'second' : 'seconds'}` : 'Not configured'}
      </DetailsItem>
      <DetailsItem
        label={podIPs && podIPs.length > 1 ? 'Pod IPs' : 'Pod IP'}
        path={podIPs && podIPs.length > 1 ? 'status.podIPs' : 'status.podIP'}
      >
        {ipsText(podIPs, obj.status?.podIP)}
      </DetailsItem>
      <DetailsItem
        label={hostIPs && hostIPs.length > 1 ? 'Host IPs' : 'Host IP'}
        path={hostIPs && hostIPs.length > 1 ? 'status.hostIPs' : 'status.hostIP'}
      >
        {ipsText(hostIPs, obj.status?.hostIP)}
      </DetailsItem>
      {obj.spec?.nodeName && (
        <DetailsItem label="Node" path="spec.nodeName">
          <BadgedName badge={{ kind: 'Node', abbr: 'N' }}>{obj.spec.nodeName}</BadgedName>
        </DetailsItem>
      )}
      {pullSecrets.length > 0 && (
        <DetailsItem label="Image pull secret" path="spec.imagePullSecrets">
          <List isPlain>
            {pullSecrets.map((secret) => (
              <ListItem key={secret.name}>
                <ObjectReferenceLink
                  apiVersion="v1"
                  kind="Secret"
                  name={secret.name}
                  namespace={obj.metadata?.namespace}
                />
              </ListItem>
            ))}
          </List>
        </DetailsItem>
      )}
    </>
  );
}

/**
 * Sections below the pod's details grid (OCP `pod.tsx` `Details`): Init containers (when any), Containers, Volumes,
 * Conditions.
 */
export function PodSections({ obj }: { obj: Pod }) {
  const initContainers = obj.spec?.initContainers ?? [];
  return (
    <>
      {initContainers.length > 0 && (
        <DetailsSubsection title="Init containers">
          <PodContainersTable
            label="Init containers"
            containers={initContainers}
            containerStatuses={obj.status?.initContainerStatuses}
          />
        </DetailsSubsection>
      )}
      <DetailsSubsection title="Containers">
        <PodContainersTable
          label="Containers"
          containers={obj.spec?.containers ?? []}
          containerStatuses={obj.status?.containerStatuses}
        />
      </DetailsSubsection>
      <DetailsSubsection title="Volumes">
        <VolumesTable spec={obj.spec} namespace={obj.metadata?.namespace} />
      </DetailsSubsection>
      <DetailsSubsection title="Conditions">
        <ConditionsTable conditions={obj.status?.conditions} />
      </DetailsSubsection>
    </>
  );
}
