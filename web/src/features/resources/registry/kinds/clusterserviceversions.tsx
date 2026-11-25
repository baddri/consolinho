import { ClusterServiceVersionModel } from '@/shared/k8s';
import { Timestamp } from '@/shared/ui';
import { CSV_PHASES, csvPhase, providedApis, type CsvResource } from '../../operators/csv';
import { CsvNameCell, CsvStatusCell, ManagedNamespaces, managedNamespacesText, ProvidedApisCell } from '../../operators/CsvCells';
import { CsvDetailsSection, CsvOverview, CsvSections, CsvSummaryExtra } from '../../operators/CsvDetails';
import { CsvIcon, csvProviderLine } from '../../operators/CsvLogo';
import { CsvSubscriptionTab } from '../../operators/CsvSubscriptionTab';
import { namespaceColumn, timestampValue } from '../columns';
import type { ResourceDescriptor } from '../types';

export type { CsvResource };

/**
 * ClusterServiceVersions as OCP's Operators → Installed Operators (OLM `ClusterServiceVersionsPage` /
 * `ClusterServiceVersionsDetailsPage`), read-only (OLM-5): titled "Installed Operators" with OCP's help text, details
 * headed by the operator's logo, display name and provider under "Installed Operators › Operator details". On all
 * namespaces the copies OLM places in each target namespace are left out (`!olm.copiedFrom`, OLM-1), so each operator
 * is listed once. List: Name (logo, display name, version and provider), Namespace, Managed Namespaces, Status (phase
 * + Subscription status), Provided APIs, Last updated — OCP's columns. Details: Provided APIs, markdown Description
 * and the provider sidebar in a lead section above "ClusterServiceVersion details", Status / Deployments /
 * ServiceAccounts / OperatorGroup beside the metadata, then Conditions; a read-only Subscription tab (OLM-4).
 */
export const clusterServiceVersionDescriptor: ResourceDescriptor<CsvResource> = {
  model: ClusterServiceVersionModel,
  nav: { section: 'operators', order: 10, label: 'Installed Operators' },
  listTitle: 'Installed Operators',
  listHelpText: 'Installed Operators are represented by ClusterServiceVersions within this Namespace.',
  detailsCrumbs: { list: 'Installed Operators', details: 'Operator details' },
  detailsHeading: (csv) => ({
    leadIcon: <CsvIcon csv={csv} />,
    title: csv.spec?.displayName ?? csv.metadata.name,
    caption: csvProviderLine(csv),
  }),
  readOnly: true,
  allNamespacesLabelSelector: {
    matchExpressions: [{ key: 'olm.copiedFrom', operator: 'DoesNotExist' }],
  },
  status: (csv) => {
    const phase = csvPhase(csv);
    return phase ? { title: phase } : undefined;
  },
  hideHeadingStatus: true,
  filters: [
    {
      id: 'status',
      title: 'Status',
      options: CSV_PHASES.map((phase) => ({ value: phase, label: phase })),
      matches: (csv, values) => values.includes(csvPhase(csv) ?? 'Unknown'),
    },
  ],
  summary: { Extra: CsvSummaryExtra },
  DetailsLead: CsvOverview,
  DetailsSection: CsvDetailsSection,
  ExtraSections: CsvSections,
  extraTabs: ['subscription'],
  KindTabs: { subscription: CsvSubscriptionTab },
  columns: [
    {
      id: 'name',
      title: 'Name',
      type: 'name',
      width: 210,
      cell: (csv) => <CsvNameCell obj={csv} />,
      sortValue: (csv) => csv.spec?.displayName ?? csv.metadata.name ?? null,
    },
    namespaceColumn(ClusterServiceVersionModel),
    {
      id: 'managedNamespaces',
      title: 'Managed Namespaces',
      cell: (csv) => <ManagedNamespaces obj={csv} />,
      sortValue: managedNamespacesText,
    },
    {
      id: 'status',
      title: 'Status',
      cell: (csv) => <CsvStatusCell obj={csv} />,
      sortValue: (csv) => csvPhase(csv) ?? null,
    },
    {
      id: 'providedAPIs',
      title: 'Provided APIs',
      cell: (csv) => <ProvidedApisCell obj={csv} />,
      sortValue: (csv) => providedApis(csv).length,
    },
    {
      id: 'lastUpdated',
      title: 'Last updated',
      cell: (csv) => <Timestamp value={csv.status?.lastUpdateTime} />,
      sortValue: (csv) => timestampValue(csv.status?.lastUpdateTime),
    },
  ],
};
