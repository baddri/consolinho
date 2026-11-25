import { Button, DescriptionList, PageSection, Popover, Title } from '@patternfly/react-core';
import { QuestionCircleIcon } from '@patternfly/react-icons';
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import {
  ServiceModel,
  type K8sResource,
  type Route,
  type RouteIngress,
  type RouteTargetReference,
} from '@/shared/k8s';
import { ConsoleEmptyState, DASH, DetailsItem, DetailsSubsection, Status } from '@/shared/ui';
import { ConditionsTable } from '../../components/ConditionsTable';
import { ResourceLink } from '../../components/ResourceLink';
import { RouteLocation } from './RouteLocation';
import { needsCustomDnsHelp, primaryIngress, trafficPercentage } from './routeTraffic';
import { routeStatus } from './routeStatus';

/** A Route on its details page (`metadata` always present). */
type RouteObject = Route & K8sResource;

/** Metadata-column rows after Annotations, as networking-plugin `DetailsSectionLeftColumn`: Service, Target port. */
export function RouteSummaryExtra({ obj }: { obj: RouteObject }) {
  return (
    <>
      <DetailsItem label="Service" path="spec.to.name">
        <ResourceLink model={ServiceModel} name={obj.spec.to.name} namespace={obj.metadata.namespace} />
      </DetailsItem>
      <DetailsItem label="Target port" path="spec.port.targetPort">
        {obj.spec.port?.targetPort ?? DASH}
      </DetailsItem>
    </>
  );
}

/**
 * networking-plugin `CustomRouteHelp`: a left-aligned link button opening a popover on pointing a custom domain's
 * CNAME record at the router.
 */
function CustomRouteHelp({ ingress }: { ingress: RouteIngress }) {
  return (
    <Popover
      headerContent="Custom route"
      bodyContent={
        <p>
          To use a custom route, you must update your DNS provider by creating a canonical name (CNAME)
          record. Your CNAME record should point to your custom domain <strong>{ingress.host}</strong>, to the
          OpenShift canonical router hostname, <strong>{ingress.routerCanonicalHostname}</strong>, as the
          alias.
        </p>
      }
    >
      <Button variant="link" icon={<QuestionCircleIcon />}>
        Do you need to set up custom DNS?
      </Button>
    </Popover>
  );
}

/** A router's canonical hostname (or `-`), with the custom-DNS help when it applies. */
function CanonicalHostname({ route, ingress }: { route: Route; ingress: RouteIngress }) {
  return (
    <>
      <div>{ingress.routerCanonicalHostname ?? DASH}</div>
      {needsCustomDnsHelp(route, ingress) && <CustomRouteHelp ingress={ingress} />}
    </>
  );
}

/**
 * Right column of the Route details (networking-plugin `DetailsSectionRightColumn`): Location, Status, Host, Path and
 * the canonical hostname of the router serving `spec.host`.
 */
export function RouteDetails({ obj }: { obj: RouteObject }) {
  const ingress = primaryIngress(obj);
  return (
    <>
      <DetailsItem label="Location">
        <RouteLocation route={obj} />
      </DetailsItem>
      <DetailsItem label="Status">
        <Status status={routeStatus(obj)} />
      </DetailsItem>
      <DetailsItem label="Host" path="spec.host">
        {obj.spec.host ?? DASH}
      </DetailsItem>
      <DetailsItem label="Path" path="spec.path">
        {obj.spec.path ?? DASH}
      </DetailsItem>
      {ingress && (
        <DetailsItem label="Router canonical hostname" path="status.ingress.routerCanonicalHostname">
          <CanonicalHostname route={obj} ingress={ingress} />
        </DetailsItem>
      )}
    </>
  );
}

/** "Set" when a PEM field has a value, else `-`: the PEM itself is never rendered (SAFE5-4). */
function pemPresence(value: string | undefined): string {
  return value ? 'Set' : DASH;
}

/**
 * networking-plugin `TLSSettingsSection`: termination, insecure traffic policy and which certificates are set. OCP
 * shows (and copies) the PEM text and reveals the key; FleetConsole only says whether each is set (SAFE5-4).
 */
function TlsSettingsSection({ route }: { route: Route }) {
  const { tls } = route.spec;
  return (
    <DetailsSubsection title="TLS Settings">
      {tls ? (
        <DescriptionList aria-label="TLS Settings">
          <DetailsItem label="Termination type" path="spec.tls.termination">
            {tls.termination}
          </DetailsItem>
          <DetailsItem label="Insecure traffic" path="spec.tls.insecureEdgeTerminationPolicy">
            {tls.insecureEdgeTerminationPolicy ?? DASH}
          </DetailsItem>
          <DetailsItem label="Certificate" path="spec.tls.certificate">
            {pemPresence(tls.certificate)}
          </DetailsItem>
          <DetailsItem label="Key" path="spec.tls.key">
            {pemPresence(tls.key)}
          </DetailsItem>
          <DetailsItem label="CA certificate" path="spec.tls.caCertificate">
            {pemPresence(tls.caCertificate)}
          </DetailsItem>
          {tls.termination === 'reencrypt' && (
            <DetailsItem label="Destination CA certificate" path="spec.tls.destinationCACertificate">
              {pemPresence(tls.destinationCACertificate)}
            </DetailsItem>
          )}
        </DescriptionList>
      ) : (
        <>TLS is not enabled.</>
      )}
    </DetailsSubsection>
  );
}

/** networking-plugin `TrafficSection`: each backend's weight and share of traffic, `spec.to` first. */
function TrafficSection({ route }: { route: RouteObject }) {
  const targets: RouteTargetReference[] = [route.spec.to, ...(route.spec.alternateBackends ?? [])];
  return (
    <DetailsSubsection title="Traffic">
      {/* OCP `co-m-pane__explanation`. */}
      <p className="pf-v6-u-text-color-subtle pf-v6-u-mb-lg">
        This route splits traffic across multiple services.
      </p>
      <Table aria-label="Traffic" variant="compact">
        <Thead>
          <Tr>
            <Th>Service</Th>
            <Th>Weight</Th>
            <Th>Percent</Th>
          </Tr>
        </Thead>
        <Tbody>
          {targets.map((target) => (
            <Tr key={target.name}>
              <Td dataLabel="Service">
                <ResourceLink model={ServiceModel} name={target.name} namespace={route.metadata.namespace} />
              </Td>
              <Td dataLabel="Weight">{target.weight ?? DASH}</Td>
              <Td dataLabel="Percent">{trafficPercentage(route, target.weight)}</Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
    </DetailsSubsection>
  );
}

/**
 * networking-plugin `IngressStatus`: one router's view of the route (host, wildcard policy, canonical hostname) and its
 * conditions. OCP stacks every router in one section 40px apart; here each router is its own bordered section.
 */
function IngressStatusSection({ route, ingress }: { route: Route; ingress: RouteIngress }) {
  return (
    <DetailsSubsection title={`Router: ${ingress.routerName}`}>
      <DescriptionList aria-label={`Router: ${ingress.routerName}`}>
        <DetailsItem label="Host" path="status.ingress.host">
          {ingress.host}
        </DetailsItem>
        <DetailsItem label="Wildcard policy" path="status.ingress.wildcardPolicy">
          {ingress.wildcardPolicy ?? DASH}
        </DetailsItem>
        <DetailsItem label="Router canonical hostname" path="status.ingress.routerCanonicalHostname">
          <CanonicalHostname route={route} ingress={ingress} />
        </DetailsItem>
      </DescriptionList>
      <Title headingLevel="h3" className="pf-v6-u-my-lg">
        Conditions
      </Title>
      <ConditionsTable conditions={ingress.conditions} />
    </DetailsSubsection>
  );
}

/** networking-plugin `NoRouteStatus` (an `EmptyBox`): no router has reported on the route yet. */
function NoRouteStatus() {
  return (
    <PageSection hasBodyWrapper={false}>
      <ConsoleEmptyState>No route status</ConsoleEmptyState>
    </PageSection>
  );
}

/**
 * Sections under the Route details, in networking-plugin `RouteDetailsTab` order: TLS Settings, Traffic (only with
 * `alternateBackends`), then a section per router in `status.ingress`, or "No route status" without any.
 */
export function RouteSections({ obj }: { obj: RouteObject }) {
  const ingresses = obj.status?.ingress ?? [];
  return (
    <>
      <TlsSettingsSection route={obj} />
      {(obj.spec.alternateBackends?.length ?? 0) > 0 && <TrafficSection route={obj} />}
      {ingresses.length === 0 ? (
        <NoRouteStatus />
      ) : (
        ingresses.map((ingress) => (
          <IngressStatusSection key={ingress.routerName} route={obj} ingress={ingress} />
        ))
      )}
    </>
  );
}
