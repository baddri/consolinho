import { ExternalLinkButton } from '@patternfly/react-component-groups';
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import { Fragment } from 'react';
import { SecretModel, ServiceModel, type Ingress, type K8sResource } from '@/shared/k8s';
import { ConsoleEmptyState, DASH, DetailsItem, DetailsSubsection } from '@/shared/ui';
import { ResourceLink } from '../../components/ResourceLink';
import { hostUrl } from '../linkOut';
import { ingressClass, ingressRuleRows, loadBalancerAddresses, type IngressRuleRow } from './ingressRules';

/** An Ingress on its details page (`metadata` always present). */
type IngressObject = Ingress & K8sResource;

/**
 * networking-plugin `TLSCert`, the "TLS certificate" row after Annotations: a link to each TLS Secret by name, or
 * "Not configured". SAFE5-4: only the name; the Secret itself is never fetched.
 */
export function IngressSummaryExtra({ obj }: { obj: IngressObject }) {
  const secrets = (obj.spec?.tls ?? []).flatMap((tls) => (tls.secretName ? [tls.secretName] : []));
  return (
    <DetailsItem label="TLS certificate" path="spec.tls">
      {obj.spec?.tls ? (
        secrets.map((name, index) => (
          <Fragment key={name}>
            {index > 0 && ', '}
            <ResourceLink model={SecretModel} name={name} namespace={obj.metadata.namespace} />
          </Fragment>
        ))
      ) : (
        <>Not configured</>
      )}
    </DetailsItem>
  );
}

/** Right column of the Ingress details: the ingress class and the addresses the load balancer reports. */
export function IngressDetails({ obj }: { obj: IngressObject }) {
  const addresses = loadBalancerAddresses(obj);
  return (
    <>
      <DetailsItem label="Ingress class" path="spec.ingressClassName">
        {ingressClass(obj) ?? DASH}
      </DetailsItem>
      <DetailsItem label="Load balancer" path="status.loadBalancer.ingress">
        {addresses.length > 0 ? addresses.map((address) => <div key={address}>{address}</div>) : DASH}
      </DetailsItem>
    </>
  );
}

/**
 * A rule's host: an external link (new tab, `noopener noreferrer`, as `RouteLocation`) to the URL {@link hostUrl}
 * builds for it (https when the host is in `spec.tls`), or plain text for `*`, wildcard and unsafe hosts (RT-2).
 */
function RuleHost({ row }: { row: IngressRuleRow }) {
  const href = hostUrl({ host: row.host, path: row.path === '*' ? undefined : row.path, tls: row.tls });
  if (href === undefined) return <>{row.host}</>;
  return (
    <ExternalLinkButton
      variant="link"
      isInline
      href={href}
      className="pf-v6-u-display-inline"
      iconProps={{ className: 'pf-v6-u-ml-xs' }}
    >
      {row.host}
    </ExternalLinkButton>
  );
}

/** networking-plugin `RulesRow`: Host, Path, Path type, Service and Service port of one path. */
function RuleRow({ row, namespace }: { row: IngressRuleRow; namespace: string | undefined }) {
  return (
    <Tr>
      <Td dataLabel="Host" className="pf-v6-u-text-break-word">
        <RuleHost row={row} />
      </Td>
      <Td dataLabel="Path" className="pf-v6-u-text-break-word">
        {row.path}
      </Td>
      <Td dataLabel="Path type" className="pf-v6-u-text-break-word" visibility={['hidden', 'visibleOnMd']}>
        {row.pathType ?? DASH}
      </Td>
      <Td dataLabel="Service" visibility={['hidden', 'visibleOnSm']}>
        {row.serviceName ? (
          <ResourceLink model={ServiceModel} name={row.serviceName} namespace={namespace} />
        ) : (
          DASH
        )}
      </Td>
      <Td dataLabel="Service port" visibility={['hidden', 'visibleOnMd']}>
        {row.servicePort ?? DASH}
      </Td>
    </Tr>
  );
}

/** networking-plugin `IngressRulesSection`: the routing explanation and a row per path, or "No Rules found". */
function IngressRulesSection({ ingress }: { ingress: IngressObject }) {
  const rows = ingressRuleRows(ingress);
  return (
    <DetailsSubsection title="Ingress rules">
      {/* OCP `co-m-pane__explanation`. */}
      <p className="pf-v6-u-text-color-subtle pf-v6-u-mb-lg">
        These rules are handled by a routing layer (Ingress Controller) which is updated as the rules are
        modified. The Ingress controller implementation defines how headers and other metadata are forwarded
        or manipulated
      </p>
      {rows.length === 0 ? (
        // networking-plugin `EmptyBox`.
        <ConsoleEmptyState>No Rules found</ConsoleEmptyState>
      ) : (
        <Table aria-label="Ingress rules" gridBreakPoint="">
          <Thead>
            <Tr>
              <Th>Host</Th>
              <Th>Path</Th>
              <Th visibility={['hidden', 'visibleOnMd']}>Path type</Th>
              <Th visibility={['hidden', 'visibleOnSm']}>Service</Th>
              <Th visibility={['hidden', 'visibleOnMd']}>Service port</Th>
            </Tr>
          </Thead>
          <Tbody>
            {rows.map((row, index) => (
              // Rows have no identity of their own: host and path may repeat across rules.
              <RuleRow key={index} row={row} namespace={ingress.metadata.namespace} />
            ))}
          </Tbody>
        </Table>
      )}
    </DetailsSubsection>
  );
}

/** The TLS section: hosts and Secret name of each `spec.tls` entry. SAFE5-4: the Secret is linked by name only. */
function IngressTlsSection({ ingress }: { ingress: IngressObject }) {
  const entries = ingress.spec?.tls ?? [];
  return (
    <DetailsSubsection title="TLS">
      {entries.length === 0 ? (
        <>TLS is not enabled.</>
      ) : (
        <Table aria-label="TLS">
          <Thead>
            <Tr>
              <Th>Hosts</Th>
              <Th>Secret name</Th>
            </Tr>
          </Thead>
          <Tbody>
            {entries.map((tls, index) => (
              <Tr key={index}>
                <Td dataLabel="Hosts" className="pf-v6-u-text-break-word">
                  {tls.hosts?.length ? tls.hosts.join(', ') : DASH}
                </Td>
                <Td dataLabel="Secret name">
                  {tls.secretName ? (
                    <ResourceLink
                      model={SecretModel}
                      name={tls.secretName}
                      namespace={ingress.metadata.namespace}
                    />
                  ) : (
                    DASH
                  )}
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}
    </DetailsSubsection>
  );
}

/** Sections under the Ingress details: Ingress rules (networking-plugin `IngressDetailsTab`), then TLS. */
export function IngressSections({ obj }: { obj: IngressObject }) {
  return (
    <>
      <IngressRulesSection ingress={obj} />
      <IngressTlsSection ingress={obj} />
    </>
  );
}
