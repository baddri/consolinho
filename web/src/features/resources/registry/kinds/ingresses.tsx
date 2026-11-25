import { IngressModel, type K8sResource, type Ingress } from '@/shared/k8s';
import {
  IngressDetails,
  IngressSections,
  IngressSummaryExtra,
} from '../../networking/ingresses/IngressDetails';
import { ingressHosts } from '../../networking/ingresses/ingressRules';
import { labelsColumn, nameColumn, namespaceColumn } from '../columns';
import type { ResourceDescriptor } from '../types';

/** A listed Ingress (`metadata` always present). */
export type IngressResource = Ingress & K8sResource;

/**
 * The Hosts cell (ING-1, networking-plugin `getHostsStr` + `HostDetails`): every host comma-joined on one truncated
 * line with the full list in `title`, or subtle "No hosts".
 */
function IngressHosts({ ingress }: { ingress: Ingress }) {
  const hosts = ingressHosts(ingress).join(', ');
  if (hosts === '') return <div className="pf-v6-u-text-color-subtle">No hosts</div>;
  return (
    <div className="pf-v6-u-text-truncate" title={hosts}>
      {hosts}
    </div>
  );
}

/**
 * Ingresses (ING-1/ING-2, networking-console-plugin `IngressesList` / `useIngressColumns`): Name, Namespace, Labels and
 * Hosts, as OCP (no Created column). Details (`IngressDetailsTab`): the TLS certificate Secret(s) in the metadata
 * column, ingress class and load balancer right, then Ingress rules (host link-outs, RT-2) and TLS. Secrets are only
 * ever linked by name (SAFE5-4).
 */
export const ingressDescriptor: ResourceDescriptor<IngressResource> = {
  model: IngressModel,
  nav: { section: 'networking', order: 30 },
  // OCP has no Events tab on this kind (T-0310 F1).
  hasEventsTab: false,
  summary: { Extra: IngressSummaryExtra },
  DetailsSection: IngressDetails,
  ExtraSections: IngressSections,
  columns: [
    nameColumn(IngressModel),
    namespaceColumn(IngressModel),
    { ...labelsColumn<IngressResource>(IngressModel), visibility: ['hidden', 'visibleOnMd'] },
    {
      id: 'hosts',
      title: 'Hosts',
      visibility: ['hidden', 'visibleOnLg'],
      cell: (ingress) => <IngressHosts ingress={ingress} />,
      // OCP sorts by the comma-joined hosts.
      sortValue: (ingress) => ingressHosts(ingress).join(', ') || null,
    },
  ],
};
