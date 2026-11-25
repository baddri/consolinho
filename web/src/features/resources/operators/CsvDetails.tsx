import {
  Alert,
  Skeleton,
  Card,
  CardBody,
  CardTitle,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  Flex,
  Grid,
  GridItem,
} from '@patternfly/react-core';
import { lazy, Suspense, type ReactNode } from 'react';
import { ExternalLinkButton } from '@patternfly/react-component-groups';
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import { DeploymentModel } from '@/shared/k8s';
import {
  ConsoleEmptyState,
  DASH,
  DetailsItem,
  DetailsSubsection,
  kindAbbr,
  SectionHeading,
  Status,
  Timestamp,
} from '@/shared/ui';
import { BadgedName, ResourceLink } from '../components/ResourceLink';
import { httpUrl, operatorGroup, operatorNamespace, providedApiName, providedApis, type CsvResource } from './csv';
import { ManagedNamespaces } from './CsvCells';
import styles from './CsvDetails.module.css';

const NOT_AVAILABLE = 'Not available';

/** react-markdown is only needed on CSV details, so it gets its own chunk instead of the registry's (T-0337 review). */
const LazyMarkdownView = lazy(() => import('./MarkdownView').then((module) => ({ default: module.MarkdownView })));

/** {@link LazyMarkdownView} with a text skeleton while its chunk loads. */
function MarkdownView({ content }: { content: string }) {
  return (
    <Suspense fallback={<Skeleton screenreaderText="Loading description" />}>
      <LazyMarkdownView content={content} />
    </Suspense>
  );
}

/** A sidebar list of one term with one description per value (OCP `co-clusterserviceversion-details__field`). */
function SidebarField({ term, children }: { term: string; children: ReactNode }) {
  return (
    <DescriptionList className={styles.sidebarField}>
      <DescriptionListGroup>
        <DescriptionListTerm>{term}</DescriptionListTerm>
        {children}
      </DescriptionListGroup>
    </DescriptionList>
  );
}

/** Provider, Created at, Links and Maintainers beside the description (OCP `ClusterServiceVersionDetails` sidebar). */
function CsvSidebar({ obj }: { obj: CsvResource }) {
  const { provider, links = [], maintainers = [] } = obj.spec ?? {};
  return (
    <>
      <SidebarField term="Provider">
        <DescriptionListDescription>{provider?.name ?? NOT_AVAILABLE}</DescriptionListDescription>
      </SidebarField>
      <SidebarField term="Created at">
        <DescriptionListDescription>
          <Timestamp value={obj.metadata.creationTimestamp} />
        </DescriptionListDescription>
      </SidebarField>
      <SidebarField term="Links">
        {links.length === 0 ? (
          <DescriptionListDescription>{NOT_AVAILABLE}</DescriptionListDescription>
        ) : (
          links.map((link, index) => {
            const href = httpUrl(link.url);
            return (
              <DescriptionListDescription key={`${link.url ?? ''}-${index}`}>
                <div className="pf-v6-u-display-flex pf-v6-u-flex-direction-column">
                  {link.name}
                  {href ? (
                    <ExternalLinkButton variant="link" isInline href={href} className={styles.breakAll}>
                      {href}
                    </ExternalLinkButton>
                  ) : (
                    <span className={styles.breakAll}>{link.url ?? DASH}</span>
                  )}
                </div>
              </DescriptionListDescription>
            );
          })
        )}
      </SidebarField>
      <SidebarField term="Maintainers">
        {maintainers.length === 0 ? (
          <DescriptionListDescription>{NOT_AVAILABLE}</DescriptionListDescription>
        ) : (
          maintainers.map((maintainer, index) => (
            <DescriptionListDescription key={`${maintainer.email ?? ''}-${index}`}>
              <div className="pf-v6-u-display-flex pf-v6-u-flex-direction-column">
                {maintainer.name}
                {maintainer.email ? (
                  <a href={`mailto:${maintainer.email}`} className={styles.breakAll}>
                    {maintainer.email}
                  </a>
                ) : (
                  DASH
                )}
              </div>
            </DescriptionListDescription>
          ))
        )}
      </SidebarField>
    </>
  );
}

/** Provided APIs as cards (OCP `CRDCardRow` / `CRDCard`): kind badge + display name, its description. No operand links. */
function ProvidedApiCards({ obj }: { obj: CsvResource }) {
  const apis = providedApis(obj);
  if (apis.length === 0) {
    return (
      <p className="pf-v6-u-mb-md pf-v6-u-text-color-subtle">No Kubernetes APIs are being provided by this Operator.</p>
    );
  }
  return (
    <Flex className="pf-v6-u-mb-md" gap={{ default: 'gapXl' }}>
      {apis.map((api) => (
        <Card key={`${api.name}/${api.version ?? ''}`} className={styles.apiCard}>
          <CardTitle>
            <BadgedName badge={{ kind: api.kind, abbr: kindAbbr(api.kind) }}>{providedApiName(api)}</BadgedName>
          </CardTitle>
          {api.description && (
            <CardBody>
              <MarkdownView content={api.description} />
            </CardBody>
          )}
        </Card>
      ))}
    </Flex>
  );
}

/**
 * Top of the CSV Details tab (OCP `ClusterServiceVersionDetails` first pane): a danger alert when the install failed,
 * Provided APIs and the markdown Description, beside Provider / Created at / Links / Maintainers.
 */
export function CsvOverview({ obj }: { obj: CsvResource }) {
  const { status, spec } = obj;
  return (
    <Grid hasGutter className="pf-v6-u-mb-lg">
      <GridItem sm={9}>
        {status?.phase === 'Failed' && (
          <Alert isInline variant="danger" title="Operator failed" className="pf-v6-u-mb-md">
            {status.reason === 'Copied'
              ? 'This Operator is a copy from another namespace, where it failed. It might not manage resources in this namespace correctly.'
              : status.message}
          </Alert>
        )}
        <SectionHeading text="Provided APIs" />
        <ProvidedApiCards obj={obj} />
        <SectionHeading text="Description" />
        <MarkdownView content={spec?.description ?? NOT_AVAILABLE} />
      </GridItem>
      <GridItem sm={3}>
        <CsvSidebar obj={obj} />
      </GridItem>
    </Grid>
  );
}

/** "Managed Namespaces" row of the metadata column (OCP `ResourceSummary` child). */
export function CsvSummaryExtra({ obj }: { obj: CsvResource }) {
  return (
    <DetailsItem label="Managed Namespaces">
      <ManagedNamespaces obj={obj} />
    </DetailsItem>
  );
}

/** Right column (OCP): Status, Status reason, Operator Deployments, Operator ServiceAccounts, OperatorGroup. */
export function CsvDetailsSection({ obj }: { obj: CsvResource }) {
  const namespace = operatorNamespace(obj);
  const deployments = obj.spec?.install?.spec?.deployments ?? [];
  const serviceAccounts = [
    ...new Set((obj.spec?.install?.spec?.permissions ?? []).map((permission) => permission.serviceAccountName)),
  ];
  const group = operatorGroup(obj);
  return (
    <>
      <DetailsItem label="Status">
        <Status status={obj.status?.phase ?? 'Unknown'} />
      </DetailsItem>
      <DetailsItem label="Status reason">{obj.status ? obj.status.message ?? DASH : 'Unknown'}</DetailsItem>
      {deployments.length > 0 && (
        <DetailsItem label="Operator Deployments">
          {deployments.map(({ name }) => (
            <ResourceLink key={name} model={DeploymentModel} name={name} namespace={namespace} />
          ))}
        </DetailsItem>
      )}
      {serviceAccounts.length > 0 && (
        <DetailsItem label="Operator ServiceAccounts">
          {serviceAccounts.map((name) => (
            <BadgedName key={name} badge={{ kind: 'ServiceAccount', abbr: 'SA' }}>
              {name}
            </BadgedName>
          ))}
        </DetailsItem>
      )}
      <DetailsItem label="OperatorGroup">
        {group ? <BadgedName badge={{ kind: 'OperatorGroup', abbr: 'OG' }}>{group}</BadgedName> : DASH}
      </DetailsItem>
    </>
  );
}

/**
 * Conditions of a CSV (OCP `Conditions` with `ConditionTypes.ClusterServiceVersion`): Phase, Updated (≥ lg), Reason,
 * Message (≥ sm) — CSV conditions are a phase history, without type or status.
 */
export function CsvSections({ obj }: { obj: CsvResource }) {
  const conditions = obj.status?.conditions ?? [];
  return (
    <DetailsSubsection title="Conditions">
      {conditions.length === 0 ? (
        <ConsoleEmptyState>No conditions found</ConsoleEmptyState>
      ) : (
        <Table aria-label="Conditions" gridBreakPoint="">
          <Thead>
            <Tr>
              <Th>Phase</Th>
              <Th visibility={['hidden', 'visibleOnLg']}>Updated</Th>
              <Th>Reason</Th>
              <Th visibility={['hidden', 'visibleOnSm']}>Message</Th>
            </Tr>
          </Thead>
          <Tbody>
            {conditions.map((condition, index) => (
              // A phase history: phases repeat and nothing else is unique, so the index is the key.
              <Tr key={index}>
                <Td dataLabel="Phase">{condition.phase ?? DASH}</Td>
                <Td dataLabel="Updated" visibility={['hidden', 'visibleOnLg']}>
                  <Timestamp value={condition.lastTransitionTime} />
                </Td>
                <Td dataLabel="Reason">{condition.reason ?? DASH}</Td>
                <Td dataLabel="Message" modifier="breakWord" visibility={['hidden', 'visibleOnSm']}>
                  {condition.message ?? DASH}
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}
    </DetailsSubsection>
  );
}
