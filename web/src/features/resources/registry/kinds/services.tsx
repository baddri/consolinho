import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import { ServiceModel, type K8sResource, type Service } from '@/shared/k8s';
import { DASH, DetailsItem, DetailsSubsection } from '@/shared/ui';
import { PodSelectorLink, labelSelectorString, labelsColumn, nameColumn, namespaceColumn } from '../columns';
import { ServiceRoutesItem } from '../../networking/services/ServiceRoutes';
import type { ResourceDescriptor } from '../types';

/** A listed service (`metadata` always present). */
export type ServiceResource = Service & K8sResource;

function serviceType(service: Service): string {
  return service.spec?.type ?? 'ClusterIP';
}

/**
 * OCP `ServiceLocation` (release-4.18 `service.jsx`): where the service is reached, one line per port or ingress —
 * `clusterIP:nodePort` (NodePort), the ingress hostname or IP (LoadBalancer, "Pending" without one),
 * `externalName:port` (ExternalName), `clusterIP:port` otherwise ("None" for a headless service).
 */
export function serviceLocations(service: Service): string[] {
  const spec = service.spec ?? {};
  const ports = spec.ports ?? [];
  const clusterIP = spec.clusterIP ? `${spec.clusterIP}:` : '';
  switch (spec.type) {
    case 'NodePort':
      return ports.map((port) => `${clusterIP}${port.nodePort ?? ''}`);
    case 'LoadBalancer': {
      const ingress = service.status?.loadBalancer?.ingress ?? [];
      return ingress.length === 0 ? ['Pending'] : ingress.map((entry) => entry.hostname ?? entry.ip ?? '-');
    }
    case 'ExternalName': {
      const externalName = spec.externalName ? `${spec.externalName}:` : '';
      return ports.map((port) => `${externalName}${port.port}`);
    }
    default:
      return spec.clusterIP === 'None' ? ['None'] : ports.map((port) => `${clusterIP}${port.port}`);
  }
}

/** The Location cell: each location on its own truncated line, as OCP's `co-truncate` rows. */
function ServiceLocation({ service }: { service: Service }) {
  return (
    <>
      {serviceLocations(service).map((location, index) => (
        // Locations may repeat (two ports without node ports), so the index keeps the keys unique.
        <div key={`${String(index)}-${location}`} className="pf-v6-u-text-truncate">
          {location}
        </div>
      ))}
    </>
  );
}

/** The service's cluster IPs (dual-stack lists several); falls back to `clusterIP`. */
function clusterIPs(service: Service): string {
  const ips = service.spec?.clusterIPs ?? (service.spec?.clusterIP ? [service.spec.clusterIP] : []);
  return ips.join(', ') || DASH;
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
            <Td dataLabel="Name">{port.name ?? DASH}</Td>
            <Td dataLabel="Port">{port.port}</Td>
            <Td dataLabel="Protocol">{port.protocol ?? 'TCP'}</Td>
            <Td dataLabel="Target port">{port.targetPort ?? port.port}</Td>
            <Td dataLabel="Node port">{port.nodePort ?? DASH}</Td>
          </Tr>
        ))}
      </Tbody>
    </Table>
  );
}

/**
 * Service fields of the Details tab's right column (UI-4): type, cluster IPs, selector, session affinity and the
 * Routes sending traffic to it (SVC-2, OpenShift only).
 */
function ServiceDetails({ obj }: { obj: ServiceResource }) {
  return (
    <>
      <DetailsItem label="Type" path="spec.type">{serviceType(obj)}</DetailsItem>
      <DetailsItem
        label={(obj.spec?.clusterIPs?.length ?? 0) > 1 ? 'Cluster IPs' : 'Cluster IP'}
        path={(obj.spec?.clusterIPs?.length ?? 0) > 1 ? 'spec.clusterIPs' : 'spec.clusterIP'}
      >
        {clusterIPs(obj)}
      </DetailsItem>
      <DetailsItem label="Pod selector" path="spec.selector">
        <PodSelectorLink namespace={obj.metadata.namespace} selector={{ matchLabels: obj.spec?.selector }} />
      </DetailsItem>
      <DetailsItem label="Session affinity" path="spec.sessionAffinity">
        {obj.spec?.sessionAffinity ?? 'None'}
      </DetailsItem>
      <ServiceRoutesItem obj={obj} />
    </>
  );
}

/** Ports section below the service's details grid (UI-4). */
function ServicePorts({ obj }: { obj: ServiceResource }) {
  return (
    <DetailsSubsection title="Ports">
      <PortsTable service={obj} />
    </DetailsSubsection>
  );
}

/**
 * Services (UI-3; OCP release-4.18 `service.jsx`, which `main` moved to the networking plugin): Name, Namespace,
 * Labels (≥ lg), Pod selector and Location (≥ xl). Type, cluster IPs and ports are on the Details tab.
 */
export const serviceDescriptor: ResourceDescriptor<ServiceResource> = {
  model: ServiceModel,
  nav: { section: 'networking', order: 10 },
  // OCP `useServiceTabs` always shows Pods; a selector-less service selects none (the tab shows its empty state).
  podsSelector: (service) =>
    Object.keys(service.spec?.selector ?? {}).length > 0 ? { matchLabels: service.spec?.selector } : undefined,
  DetailsSection: ServiceDetails,
  ExtraSections: ServicePorts,
  columns: [
    nameColumn(ServiceModel),
    namespaceColumn(ServiceModel),
    { ...labelsColumn<ServiceResource>(ServiceModel), visibility: ['hidden', 'visibleOnLg'] },
    {
      id: 'selector',
      title: 'Pod selector',
      visibility: ['hidden', 'visibleOnXl'],
      cell: (service) => (
        <PodSelectorLink namespace={service.metadata.namespace} selector={{ matchLabels: service.spec?.selector }} />
      ),
      sortValue: (service) => labelSelectorString({ matchLabels: service.spec?.selector }),
    },
    {
      id: 'location',
      title: 'Location',
      visibility: ['hidden', 'visibleOnXl'],
      allNamespacesVisibility: ['hidden', 'visibleOn2Xl'],
      cell: (service) => <ServiceLocation service={service} />,
      // OCP sorts Location by `spec.clusterIP`.
      sortValue: (service) => service.spec?.clusterIP ?? null,
    },
  ],
};
