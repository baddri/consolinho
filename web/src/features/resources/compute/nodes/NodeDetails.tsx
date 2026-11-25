import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import type { K8sResource, Node } from '@/shared/k8s';
import { DASH, DetailsSubsection } from '@/shared/ui';
import { nodeResourceRows } from './node';
import { NodeConditionsTable } from './NodeConditionsTable';

/** A listed Node (`metadata` always present). */
export type NodeResource = Node & K8sResource;

/** "Capacity and allocatable" *(fleet arrangement of OCP data)*: CPU, Memory, Ephemeral storage and Pods, compact. */
function CapacityTable({ node }: { node: Node }) {
  return (
    <Table aria-label="Capacity and allocatable" variant="compact" gridBreakPoint="">
      <Thead>
        <Tr>
          <Th>Resource</Th>
          <Th>Capacity</Th>
          <Th>Allocatable</Th>
        </Tr>
      </Thead>
      <Tbody>
        {nodeResourceRows(node).map((row) => (
          <Tr key={row.resource}>
            <Td dataLabel="Resource">{row.resource}</Td>
            <Td dataLabel="Capacity">{row.capacity ?? DASH}</Td>
            <Td dataLabel="Allocatable">{row.allocatable ?? DASH}</Td>
          </Tr>
        ))}
      </Tbody>
    </Table>
  );
}

/** Full-width sections under the Node details grid: Node conditions (OCP `NodeDetailsConditions`), Capacity and allocatable. */
export function NodeSections({ obj }: { obj: NodeResource }) {
  return (
    <>
      <DetailsSubsection title="Node conditions">
        <NodeConditionsTable conditions={obj.status?.conditions} />
      </DetailsSubsection>
      <DetailsSubsection title="Capacity and allocatable">
        <CapacityTable node={obj} />
      </DetailsSubsection>
    </>
  );
}
