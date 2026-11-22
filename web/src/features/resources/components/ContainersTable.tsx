import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import type { Pod } from '@/shared/k8s';

type Container = NonNullable<Pod['spec']>['containers'][number];

/** "cpu: 500m, memory: 128Mi" of a container's resource limits; "-" without any. */
function limitsText(container: Container): string {
  return (
    Object.entries(container.resources?.limits ?? {})
      .map(([key, value]) => `${key}: ${value}`)
      .join(', ') || '-'
  );
}

/** "8080/TCP, 8443/TCP"; "-" without ports. */
function portsText(container: Container): string {
  return (
    (container.ports ?? [])
      .map((port) => `${String(port.containerPort)}/${port.protocol ?? 'TCP'}`)
      .join(', ') || '-'
  );
}

/**
 * The containers of a pod template (workload Details tab), as OCP `public/components/utils/container-table.tsx`:
 * Name, Image, Resource limits (≥ sm), Ports (≥ md).
 */
export function ContainersTable({ containers }: { containers: readonly Container[] }) {
  return (
    <Table aria-label="Containers" gridBreakPoint="">
      <Thead>
        <Tr>
          <Th>Name</Th>
          <Th>Image</Th>
          <Th visibility={['hidden', 'visibleOnSm']}>Resource limits</Th>
          <Th visibility={['hidden', 'visibleOnMd']}>Ports</Th>
        </Tr>
      </Thead>
      <Tbody>
        {containers.map((container) => (
          <Tr key={container.name}>
            <Td dataLabel="Name">{container.name}</Td>
            <Td dataLabel="Image" modifier="breakWord">
              {container.image ?? '-'}
            </Td>
            <Td dataLabel="Resource limits" visibility={['hidden', 'visibleOnSm']}>
              {limitsText(container)}
            </Td>
            <Td dataLabel="Ports" visibility={['hidden', 'visibleOnMd']}>
              {portsText(container)}
            </Td>
          </Tr>
        ))}
      </Tbody>
    </Table>
  );
}
