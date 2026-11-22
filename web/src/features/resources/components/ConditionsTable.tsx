import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import { Timestamp } from '@/shared/ui';

/** The fields every Kubernetes status condition has (pod, deployment, replica set…). */
export interface K8sCondition {
  type: string;
  status: string;
  reason?: string;
  message?: string;
  lastTransitionTime?: string;
}

/**
 * Status conditions as OCP `public/components/conditions.tsx`: Type, Status, Updated (last transition, ≥ lg), Reason,
 * Message (≥ sm); "No conditions found" without any.
 */
export function ConditionsTable({ conditions }: { conditions: readonly K8sCondition[] | undefined }) {
  if (!conditions?.length) return <>No conditions found</>;
  return (
    <Table aria-label="Conditions" gridBreakPoint="">
      <Thead>
        <Tr>
          <Th>Type</Th>
          <Th>Status</Th>
          <Th visibility={['hidden', 'visibleOnLg']}>Updated</Th>
          <Th>Reason</Th>
          <Th visibility={['hidden', 'visibleOnSm']}>Message</Th>
        </Tr>
      </Thead>
      <Tbody>
        {conditions.map((condition) => (
          <Tr key={condition.type}>
            <Td dataLabel="Type">{condition.type}</Td>
            <Td dataLabel="Status">{condition.status}</Td>
            <Td dataLabel="Updated" visibility={['hidden', 'visibleOnLg']}>
              <Timestamp value={condition.lastTransitionTime} />
            </Td>
            <Td dataLabel="Reason">{condition.reason ?? '-'}</Td>
            <Td dataLabel="Message" modifier="breakWord" visibility={['hidden', 'visibleOnSm']}>
              {/* Route messages start with a newline (OCP trims it); empty → "-". */}
              {condition.message?.trim() ? condition.message.trim() : '-'}
            </Td>
          </Tr>
        ))}
      </Tbody>
    </Table>
  );
}
