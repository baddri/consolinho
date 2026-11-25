import { Alert, Card, CardHeader, CardTitle } from '@patternfly/react-core';
import { useMemo } from 'react';
import { Link } from 'react-router';
import {
  clusterHealth,
  clusterOperatorFacts,
  clusterUpdate,
  clusterVersionFacts,
  nodeFacts,
  probeOutcome,
  type ClusterHealthFacts,
  type ClusterHealthStatus,
} from '@/shared/health';
import { ClusterServiceVersionModel, type ClusterServiceVersion } from '@/shared/k8s';
import { useClusterVersion } from '../cluster-settings/useClusterVersion';
import { clusterSettingsPath } from '../paths';
import { CardReadErrors, isUnreadable } from './cardParts';
import { HealthItem, type HealthState } from './HealthItem';
import { operatorHealths, operatorsHealthSummary } from './operatorHealth';
import { OperatorsPopoverBody, type CsvSummary } from './OperatorsPopoverBody';
import styles from './Overview.module.css';
import {
  useClusterOperators,
  useKubernetesVersion,
  useNodes,
  type KubernetesVersionInfo,
} from './useOverviewData';
import { countText, useResourceCount } from './useResourceCount';

/**
 * The "Cluster" item from the shared {@link clusterHealth} status (the fleet page's rule): OCP's wording — healthy is
 * a bare green check, "Updating", "Degraded"; `restricted` (some reads forbidden) keeps the fleet word.
 */
const CLUSTER_ITEM: Record<ClusterHealthStatus, { state: HealthState; detail?: string }> = {
  healthy: { state: 'ok' },
  updating: { state: 'updating', detail: 'Updating' },
  degraded: { state: 'warning', detail: 'Degraded' },
  restricted: { state: 'unknown', detail: 'Restricted' },
  unreachable: { state: 'notAvailable', detail: 'Not available' },
  tokenInvalid: { state: 'notAvailable', detail: 'Not available' },
};

/** CSVs listed once across namespaces, as the all-namespaces Installed Operators list (OLM-1). */
const CSV_SELECTOR = '!olm.copiedFrom';

/** Props for {@link StatusCard}. */
export interface StatusCardProps {
  cluster: string;
  isOpenShift: boolean;
  /** Discovery says OLM (`operators.coreos.com`) is served: adds the CSV line to the Operators popover. */
  isOlmServed: boolean;
}

/**
 * Status card (OVW-3, OCP `status-card.tsx`): health items computed by the shared rules from the live ClusterVersion,
 * ClusterOperators and Nodes — "Cluster" and "Operators" (popover listing the operators that aren't OK) on OpenShift,
 * "Nodes" on Kubernetes — and the update notice when a cluster version update is available.
 */
export function StatusCard({ cluster, isOpenShift, isOlmServed }: StatusCardProps) {
  const cv = useClusterVersion(cluster, { enabled: isOpenShift });
  const cos = useClusterOperators(cluster, isOpenShift);
  const nodes = useNodes(cluster, true);
  const kube = useKubernetesVersion(cluster, !isOpenShift);
  const csvs = useResourceCount<ClusterServiceVersion>(cluster, ClusterServiceVersionModel, {
    labelSelector: CSV_SELECTOR,
    enabled: isOpenShift && isOlmServed,
  });

  const cvFacts = clusterVersionFacts(cv.data, cv.error);
  const health = clusterHealth({
    failure: null,
    clusterVersion: cvFacts,
    clusterOperators: clusterOperatorFacts(cos.data, cos.error),
    nodes: nodeFacts(nodes.data, nodes.error),
    kubernetesVersion: kubeFacts(kube.data, kube.error),
  });
  const healths = useMemo(() => operatorHealths(cos.data ?? []), [cos.data]);
  const update = clusterUpdate(cvFacts);

  const clusterLoading = isOpenShift ? cv.isPending || cos.isPending || nodes.isPending : nodes.isPending;
  const operatorsItem = (() => {
    if (cos.error) return { state: 'notAvailable' as const, detail: 'Not available' };
    if (cos.isPending) return { state: 'loading' as const };
    return operatorsHealthSummary(healths);
  })();
  const csvSummary: CsvSummary | undefined =
    isOpenShift && isOlmServed && !csvs.isPending
      ? {
          installed: csvs.data ? countText(csvs.data.count, csvs.data.exact) : '',
          failed: csvs.data?.items.filter((csv) => csv.status?.phase === 'Failed').length ?? 0,
          error: csvs.isError,
        }
      : undefined;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Status</CardTitle>
      </CardHeader>
      <div className={styles.healthBody}>
        <CardReadErrors
          reads={[
            ['ClusterVersion', cv.error],
            ['ClusterOperators', cos.error],
            ['Nodes', nodes.error],
            ['version', kube.error],
          ]}
        />
        {isOpenShift ? (
          <>
            <HealthItem
              title="Cluster"
              {...(clusterLoading ? { state: 'loading' } : CLUSTER_ITEM[health.status])}
            />
            <HealthItem
              title="Operators"
              {...operatorsItem}
              popover={{
                header: 'Operator status',
                body: <OperatorsPopoverBody cluster={cluster} healths={healths} csvs={csvSummary} />,
              }}
            />
          </>
        ) : (
          <HealthItem title="Nodes" {...nodesItem(nodes.isPending, nodes.error, health.status)} />
        )}
      </div>
      {update?.kind === 'available' && (
        <div className={styles.alertsBody}>
          <Alert
            variant="info"
            isInline
            isPlain
            title="A cluster version update is available"
            actionLinks={<Link to={clusterSettingsPath(cluster)}>View settings</Link>}
          />
        </div>
      )}
    </Card>
  );
}

/** The Kubernetes "Nodes" item: the shared status (only nodes feed it there) or "Not available" without a read. */
function nodesItem(
  isPending: boolean,
  error: unknown,
  status: ClusterHealthStatus,
): { state: HealthState; detail?: string } {
  if (error) return { state: 'notAvailable', detail: isUnreadable(error) ? 'Not available' : undefined };
  if (isPending) return { state: 'loading' };
  return status === 'degraded' ? { state: 'warning', detail: 'Not ready' } : CLUSTER_ITEM[status];
}

/** The `GET /version` read as the shared rules' fact (ok with the version, or the 403/404 outcome). */
function kubeFacts(
  data: KubernetesVersionInfo | undefined,
  error: unknown,
): ClusterHealthFacts['kubernetesVersion'] {
  if (data) return { outcome: 'ok', gitVersion: data.gitVersion ?? null };
  const outcome = probeOutcome(error);
  return outcome ? { outcome, gitVersion: null } : null;
}
