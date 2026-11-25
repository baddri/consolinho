import {
  Bullseye,
  Card,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListTerm,
  Spinner,
  Split,
  SplitItem,
} from '@patternfly/react-core';
import { Link } from 'react-router';
import {
  ClusterServiceVersionModel,
  InstallPlanModel,
  NamespaceModel,
  SubscriptionModel,
  type InstallPlan,
} from '@/shared/k8s';
import {
  ConsoleEmptyState,
  DetailsColumn,
  DetailsGrid,
  DetailsItem,
  DetailsSubsection,
  ResourceLabels,
  StatusIconText,
  Timestamp,
} from '@/shared/ui';
import { useK8sGet, useK8sList } from '@/shared/k8s';
import { ConditionsTable } from '../components/ConditionsTable';
import { BadgedName, ResourceLink } from '../components/ResourceLink';
import { ResourceErrorState } from '../components/ResourceErrorState';
import { resourcePath } from '../paths';
import { operatorNamespace, upgradeRequiresApproval, type CsvResource, type SubscriptionResource } from './csv';
import styles from './CsvSubscriptionTab.module.css';

const NONE = 'None';

/** The Subscription's state as OCP `SubscriptionStatus` words it, with the matching status icon. */
function SubscriptionState({
  subscription,
  requiresApproval,
}: {
  subscription: SubscriptionResource;
  requiresApproval: boolean;
}) {
  const state = subscription.status?.state;
  switch (state) {
    case 'UpgradeAvailable':
      return <StatusIconText status="warning" text="Upgrade available" />;
    case 'UpgradePending':
      return requiresApproval ? (
        <StatusIconText status="info" text="Upgrade available" />
      ) : (
        <StatusIconText status="pending" text="Upgrading" />
      );
    case 'AtLatestKnown':
      return <StatusIconText status="success" text="Up to date" />;
    default:
      return <span className={state ? undefined : 'pf-v6-u-text-color-subtle'}>{state ?? 'Unknown failure'}</span>;
  }
}

/** "Cannot update" with why (OCP `SourceMissingStatus` / `SourceUnhealthyStatus`). */
function CannotUpdate({ reason }: { reason: string }) {
  return (
    <>
      <StatusIconText status="warning" text="Cannot update" />
      <div className="pf-v6-u-text-color-subtle">{reason}</div>
    </>
  );
}

/** Text of the pending InstallPlan in the breakdown (OCP `installPlanPhase`). */
function installPlanPhaseText(installPlan: InstallPlan): string {
  switch (installPlan.status?.phase) {
    case 'RequiresApproval':
      return '1 requires approval';
    case 'Failed':
      return '1 failed';
    default:
      return '1 installing';
  }
}

interface UpdatesProps {
  cluster: string;
  subscription: SubscriptionResource;
  installPlan: InstallPlan | undefined;
}

/**
 * Update channel, Update approval and Upgrade status cards (OCP `SubscriptionUpdates`), read-only (OLM-5: no channel
 * or approval modals). The status reads the catalog's health first, then the Subscription's state; with a healthy
 * catalog the breakdown counts the installed CSV and the pending InstallPlan ("1 requires approval").
 */
function SubscriptionUpdates({ cluster, subscription, installPlan }: UpdatesProps) {
  const { spec, status, metadata } = subscription;
  const health = status?.catalogHealth?.find((entry) => entry.catalogSourceRef.name === spec?.source);
  const requiresApproval = upgradeRequiresApproval(subscription, installPlan);
  const installedCsv = status?.installedCSV;
  return (
    <DescriptionList className={`${styles.updates} pf-v6-u-mb-lg`}>
      <Card>
        <DescriptionListTerm>Update channel</DescriptionListTerm>
        <DescriptionListDescription>{spec?.channel ?? 'No channel'}</DescriptionListDescription>
      </Card>
      <Card>
        <DescriptionListTerm>Update approval</DescriptionListTerm>
        <DescriptionListDescription>{spec?.installPlanApproval ?? 'Automatic'}</DescriptionListDescription>
      </Card>
      <Card>
        <Split hasGutter>
          <SplitItem>
            <DescriptionListTerm>Upgrade status</DescriptionListTerm>
            <DescriptionListDescription>
              {!health ? (
                <CannotUpdate reason="CatalogSource not found" />
              ) : health.healthy ? (
                <SubscriptionState subscription={subscription} requiresApproval={requiresApproval} />
              ) : (
                <CannotUpdate reason="CatalogSource unhealthy" />
              )}
            </DescriptionListDescription>
          </SplitItem>
          {health?.healthy && (
            <SplitItem className={styles.breakdown}>
              {installedCsv ? (
                <Link
                  to={resourcePath(cluster, ClusterServiceVersionModel, {
                    namespace: metadata.namespace,
                    name: installedCsv,
                  })}
                >
                  1 installed
                </Link>
              ) : (
                <span>0 installed</span>
              )}
              <span>
                {status?.state === 'UpgradePending' && installPlan
                  ? installPlanPhaseText(installPlan)
                  : '0 installing'}
              </span>
            </SplitItem>
          )}
        </Split>
      </Card>
    </DescriptionList>
  );
}

/**
 * Body of the Subscription tab once the Subscription is known (OCP `SubscriptionDetails`): the update cards, then the
 * Subscription's metadata (Name, Namespace, Labels, Created at — no annotations, as OCP) beside Installed version,
 * Starting version, CatalogSource and InstallPlan; then its Conditions.
 */
function SubscriptionDetails({ cluster, subscription }: { cluster: string; subscription: SubscriptionResource }) {
  const { metadata, spec, status } = subscription;
  const planRef = status?.installPlanRef;
  const { data: installPlan } = useK8sGet<InstallPlan>(
    cluster,
    InstallPlanModel,
    planRef?.namespace ?? metadata.namespace,
    planRef?.name ?? '',
    { enabled: planRef?.name !== undefined },
  );
  return (
    <>
      <DetailsSubsection title="Subscription details">
        <SubscriptionUpdates cluster={cluster} subscription={subscription} installPlan={installPlan} />
        <DetailsGrid>
          <DetailsColumn aria-label="Subscription metadata">
            <DetailsItem label="Name">{metadata.name}</DetailsItem>
            {metadata.namespace && (
              <DetailsItem label="Namespace">
                <ResourceLink model={NamespaceModel} name={metadata.namespace} />
              </DetailsItem>
            )}
            <DetailsItem label="Labels">
              <ResourceLabels labels={metadata.labels ?? {}} />
            </DetailsItem>
            <DetailsItem label="Created at">
              <Timestamp value={metadata.creationTimestamp} />
            </DetailsItem>
          </DetailsColumn>
          <DetailsColumn aria-label="Subscription properties">
            <DetailsItem label="Installed version">
              {status?.installedCSV ? (
                <ResourceLink
                  model={ClusterServiceVersionModel}
                  name={status.installedCSV}
                  namespace={metadata.namespace}
                />
              ) : (
                NONE
              )}
            </DetailsItem>
            <DetailsItem label="Starting version">{spec?.startingCSV ?? NONE}</DetailsItem>
            <DetailsItem label="CatalogSource">
              {spec?.source && spec.sourceNamespace ? (
                <BadgedName badge={{ kind: 'CatalogSource', abbr: 'CS' }}>
                  {`${spec.source} (${spec.sourceNamespace})`}
                </BadgedName>
              ) : (
                NONE
              )}
            </DetailsItem>
            <DetailsItem label="InstallPlan">
              {planRef?.name ? (
                <BadgedName badge={InstallPlanModel}>
                  {planRef.name}
                  {installPlan?.status?.phase && (
                    <span className="pf-v6-u-text-color-subtle">{` (${installPlan.status.phase})`}</span>
                  )}
                </BadgedName>
              ) : (
                NONE
              )}
            </DetailsItem>
          </DetailsColumn>
        </DetailsGrid>
      </DetailsSubsection>
      <DetailsSubsection title="Conditions">
        <ConditionsTable conditions={status?.conditions} />
      </DetailsSubsection>
    </>
  );
}

/**
 * Subscription tab of a CSV (OLM-4, OCP `CSVSubscription`): the Subscription in the operator's namespace whose
 * `status.installedCSV` is this CSV, read-only. Loading, error and "No Operator Subscription" states as OCP's
 * `StatusBox`.
 */
export function CsvSubscriptionTab({ cluster, obj }: { cluster: string; obj: CsvResource }) {
  const namespace = operatorNamespace(obj);
  const list = useK8sList<SubscriptionResource>(cluster, SubscriptionModel, {
    namespace,
  });
  const { data, error, isPending } = list;
  if (error) {
    return (
      <ResourceErrorState
        error={error}
        cluster={cluster}
        model={SubscriptionModel}
        namespace={namespace}
        onRetry={() => list.refetch()}
      />
    );
  }
  if (isPending) {
    return (
      <Bullseye>
        <Spinner size="lg" aria-label="Loading Subscription" />
      </Bullseye>
    );
  }
  const subscription = data?.find((candidate) => candidate.status?.installedCSV === obj.metadata.name);
  if (!subscription) {
    return (
      <ConsoleEmptyState title="No Operator Subscription">
        This Operator will not receive updates because it has no Subscription. To get updates, create a Subscription
        for this Operator from the software catalog.
      </ConsoleEmptyState>
    );
  }
  return <SubscriptionDetails cluster={cluster} subscription={subscription} />;
}
