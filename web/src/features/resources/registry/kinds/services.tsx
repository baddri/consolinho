import { DescriptionList, Stack, StackItem, Title } from '@patternfly/react-core';
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import { ServiceModel, type K8sResource, type Service } from '@/shared/k8s';
import { PodSelectorLink, labelSelectorString, nameColumn, namespaceColumn } from '../columns';
import type { ResourceDescriptor } from '../types';
import { DetailItem } from './DetailItem';

/** A listed service (`metadata` always present). */
export type ServiceResource = Service & K8sResource;

type ServicePort = NonNullable<NonNullable<Service['spec']>['ports']>[number];

function serviceType(service: Service): string {
  return service.spec?.type ?? 'ClusterIP';
}

/** `80/TCP → 8080` (target port only when it differs from the port), ports comma-joined; "—" without ports. */
export function portsText(service: Service): string {
  const ports = service.spec?.ports ?? [];
  if (ports.length === 0) return '—';
  return ports.map(portText).join(', ');
}

function portText(port: ServicePort): string {
  const base = `${port.port}/${port.protocol ?? 'TCP'}`;
  const target = port.targetPort;
  return target === undefined || target === port.port ? base : `${base} → ${String(target)}`;
}

/** The service's cluster IPs (dual-stack lists several); falls back to `clusterIP`. */
function clusterIPs(service: Service): string {
  const ips = service.spec?.clusterIPs ?? (service.spec?.clusterIP ? [service.spec.clusterIP] : []);
  return ips.join(', ') || '—';
}

/** Ports table: name, port, protocol, target port, node port. */
function PortsTable({ service }: { service: Service }) {
  return (
    <Table aria-label="Ports" variant="compact">
      <Thead>
        <Tr>
          <Th>Name</Th>
          <Th>Port</Th>
          <Th>Protocol</Th>
          <Th>Target port</Th>
          <Th>Node port</Th>
        </Tr>
      </Thead>
      <Tbody>
        {(service.spec?.ports ?? []).map((port) => (
          <Tr key={`${port.port}/${port.protocol ?? 'TCP'}`}>
            <Td dataLabel="Name">{port.name ?? '—'}</Td>
            <Td dataLabel="Port">{port.port}</Td>
            <Td dataLabel="Protocol">{port.protocol ?? 'TCP'}</Td>
            <Td dataLabel="Target port">{port.targetPort ?? port.port}</Td>
            <Td dataLabel="Node port">{port.nodePort ?? '—'}</Td>
          </Tr>
        ))}
      </Tbody>
    </Table>
  );
}

/** Service part of the Details tab (UI-4): type, cluster IPs, selector, session affinity and the ports table. */
function ServiceDetails({ obj }: { obj: ServiceResource }) {
  return (
    <Stack hasGutter>
      <StackItem>
        <DescriptionList aria-label="Service details" isCompact isHorizontal>
          <DetailItem term="Type">{serviceType(obj)}</DetailItem>
          <DetailItem term={(obj.spec?.clusterIPs?.length ?? 0) > 1 ? 'Cluster IPs' : 'Cluster IP'}>
            {clusterIPs(obj)}
          </DetailItem>
          <DetailItem term="Pod selector">
            <PodSelectorLink namespace={obj.metadata.namespace} matchLabels={obj.spec?.selector} />
          </DetailItem>
          <DetailItem term="Session affinity">{obj.spec?.sessionAffinity ?? 'None'}</DetailItem>
        </DescriptionList>
      </StackItem>
      <StackItem>
        <Title headingLevel="h3">Ports</Title>
      </StackItem>
      <StackItem>
        <PortsTable service={obj} />
      </StackItem>
    </Stack>
  );
}

/** Services (UI-3): Name, Namespace, Type, Cluster IP, Ports, Selector. */
export const serviceDescriptor: ResourceDescriptor<ServiceResource> = {
  model: ServiceModel,
  nav: { section: 'networking', order: 10 },
  DetailsSection: ServiceDetails,
  columns: [
    nameColumn(ServiceModel),
    namespaceColumn(ServiceModel),
    { id: 'type', title: 'Type', cell: serviceType, sortValue: serviceType },
    {
      id: 'clusterIP',
      title: 'Cluster IP',
      cell: (service) => service.spec?.clusterIP ?? '—',
      sortValue: (service) => service.spec?.clusterIP ?? null,
    },
    { id: 'ports', title: 'Ports', cell: portsText },
    {
      id: 'selector',
      title: 'Selector',
      cell: (service) => (
        <PodSelectorLink namespace={service.metadata.namespace} matchLabels={service.spec?.selector} />
      ),
      sortValue: (service) => labelSelectorString(service.spec?.selector),
    },
  ],
};
