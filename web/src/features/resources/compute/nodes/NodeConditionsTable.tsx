import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import type { NodeCondition } from 'kubernetes-types/core/v1';
import { ConsoleEmptyState, DASH, Timestamp } from '@/shared/ui';

/**
 * Node conditions as OCP `NodeDetailsConditions`: a compact table of Type, Status, Reason, Updated (the kubelet's
 * last heartbeat) and Changed (last transition), without the generic table's Message column. Node-local on purpose:
 * no other kind reports heartbeats, so the shared `ConditionsTable` stays as OCP `conditions.tsx`.
 */
export function NodeConditionsTable({ conditions }: { conditions: readonly NodeCondition[] | undefined }) {
  if (!conditions?.length) return <ConsoleEmptyState>No conditions found</ConsoleEmptyState>;
  return (
    <Table aria-label="Node conditions" variant="compact" gridBreakPoint="">
      <Thead>
        <Tr>
          <Th>Type</Th>
          <Th>Status</Th>
          <Th>Reason</Th>
          <Th>Updated</Th>
          <Th>Changed</Th>
        </Tr>
      </Thead>
      <Tbody>
        {conditions.map((condition) => (
          <Tr key={condition.type}>
            <Td dataLabel="Type">{condition.type}</Td>
            <Td dataLabel="Status">{condition.status}</Td>
            <Td dataLabel="Reason">{condition.reason ?? DASH}</Td>
            <Td dataLabel="Updated">
              <Timestamp value={condition.lastHeartbeatTime} />
            </Td>
            <Td dataLabel="Changed">
              <Timestamp value={condition.lastTransitionTime} />
            </Td>
          </Tr>
        ))}
      </Tbody>
    </Table>
  );
}
