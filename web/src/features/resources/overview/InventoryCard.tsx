import {
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Icon,
  Skeleton,
  Stack,
  StackItem,
} from '@patternfly/react-core';
import { RhUiErrorFillIcon, RhUiInProgressIcon } from '@patternfly/react-icons';
import type { ComponentType } from 'react';
import { Link } from 'react-router';
import { nodeReadiness } from '@/shared/health';
import {
  NodeModel,
  PersistentVolumeClaimModel,
  PodModel,
  StorageClassModel,
  type K8sModel,
  type Node,
  type PersistentVolumeClaim,
} from '@/shared/k8s';
import { ALL_NAMESPACES, resourcePath } from '../paths';
import { CardReadErrors, isUnreadable, NotAvailable } from './cardParts';
import styles from './Overview.module.css';
import { countText, useResourceCount, type ResourceCount } from './useResourceCount';

/** One status group of an inventory row (OCP `InventoryItem` status groups): icon + count, linking to a filtered list. */
interface StatusGroup {
  key: string;
  count: string;
  icon: 'error' | 'progress';
  title: string;
  to: string;
}

/** OCP inventory group icons: red error circle (Failed / Not Ready), in-progress (Pending). */
const GROUP_ICONS: Record<StatusGroup['icon'], ComponentType<{ title?: string }>> = {
  error: RhUiErrorFillIcon,
  progress: RhUiInProgressIcon,
};

/** Props for {@link InventoryItem}. */
interface InventoryItemProps {
  model: K8sModel;
  to: string;
  isLoading: boolean;
  error: unknown;
  count?: ResourceCount<unknown>;
  groups?: StatusGroup[];
}

/**
 * One inventory row (OCP `InventoryItem`): "12 Nodes" linking to the list, then the status groups with a count on the
 * right. A forbidden read says "Not available" next to the plural title.
 */
function InventoryItem({ model, to, isLoading, error, count, groups = [] }: InventoryItemProps) {
  const title = (() => {
    if (isLoading) return <Skeleton width="6rem" screenreaderText={`Loading ${model.labelPlural}`} />;
    if (error || !count) return model.labelPlural;
    const label = count.exact && count.count === 1 ? model.label : model.labelPlural;
    return <Link to={to}>{`${countText(count.count, count.exact)} ${label}`}</Link>;
  })();
  return (
    <div className={styles.inventoryItem}>
      <div className={styles.inventoryTitle}>{title}</div>
      <div className={styles.inventoryStatuses}>
        {isUnreadable(error) && <NotAvailable />}
        {!isLoading &&
          !error &&
          groups.map(({ key, count: groupCount, icon, title: groupTitle, to: groupTo }) => {
            const Glyph = GROUP_ICONS[icon];
            return (
              <Link key={key} to={groupTo} className={styles.inventoryStatus}>
                <Icon status={icon === 'error' ? 'danger' : undefined} isInline>
                  <Glyph title={groupTitle} />
                </Icon>
                <span>{groupCount}</span>
              </Link>
            );
          })}
      </div>
    </div>
  );
}

/** Props for {@link InventoryCard}. */
export interface InventoryCardProps {
  cluster: string;
  /** Discovery's `isServed`: rows of kinds the cluster doesn't serve are hidden. */
  isServed: (model: K8sModel) => boolean;
}

/**
 * Cluster inventory card (OVW-4, OCP `inventory-card.tsx`): Nodes (Not Ready), Pods (Failed, Pending), StorageClasses
 * and PersistentVolumeClaims (Pending). Every number is one `limit`ed list request ({@link useResourceCount}); "n+"
 * when the page had a `continue` token. Status groups with a zero count are not shown, as in OCP.
 */
export function InventoryCard({ cluster, isServed }: InventoryCardProps) {
  const nodes = useResourceCount<Node>(cluster, NodeModel, { enabled: isServed(NodeModel) });
  const pods = useResourceCount(cluster, PodModel, { enabled: isServed(PodModel) });
  const failedPods = useResourceCount(cluster, PodModel, {
    fieldSelector: 'status.phase=Failed',
    enabled: isServed(PodModel),
  });
  const pendingPods = useResourceCount(cluster, PodModel, {
    fieldSelector: 'status.phase=Pending',
    enabled: isServed(PodModel),
  });
  const storageClasses = useResourceCount(cluster, StorageClassModel, {
    enabled: isServed(StorageClassModel),
  });
  const pvcs = useResourceCount<PersistentVolumeClaim>(cluster, PersistentVolumeClaimModel, {
    enabled: isServed(PersistentVolumeClaimModel),
  });

  const podList = (status?: string) =>
    resourcePath(cluster, PodModel, { namespace: ALL_NAMESPACES, search: status ? { status } : undefined });
  const pvcList = (status?: string) =>
    resourcePath(cluster, PersistentVolumeClaimModel, {
      namespace: ALL_NAMESPACES,
      search: status ? { status } : undefined,
    });
  const notReady = nodes.data?.items.filter((n) => nodeReadiness(n) !== 'Ready').length ?? 0;
  const pendingPvcs = pvcs.data?.items.filter((p) => p.status?.phase === 'Pending').length ?? 0;

  const nodeGroups: StatusGroup[] = notReady
    ? [
        {
          key: 'notReady',
          count: String(notReady),
          icon: 'error',
          title: 'Not Ready',
          to: resourcePath(cluster, NodeModel, { search: { status: 'Not Ready' } }),
        },
      ]
    : [];
  const podGroups: StatusGroup[] = [
    { key: 'failed', result: failedPods, icon: 'error' as const, title: 'Failed' },
    { key: 'pending', result: pendingPods, icon: 'progress' as const, title: 'Pending' },
  ]
    .filter(({ result }) => result.data && result.data.count > 0)
    .map(({ key, result, icon, title }) => ({
      key,
      count: countText(result.data?.count ?? 0, result.data?.exact ?? true),
      icon,
      title,
      to: podList(title),
    }));
  const pvcGroups: StatusGroup[] = pendingPvcs
    ? [
        {
          key: 'pending',
          count: String(pendingPvcs),
          icon: 'progress',
          title: 'Pending',
          to: pvcList('Pending'),
        },
      ]
    : [];

  const rows = [
    { model: NodeModel, result: nodes, to: resourcePath(cluster, NodeModel), groups: nodeGroups },
    { model: PodModel, result: pods, to: podList(), groups: podGroups },
    {
      model: StorageClassModel,
      result: storageClasses,
      to: resourcePath(cluster, StorageClassModel),
      groups: [],
    },
    { model: PersistentVolumeClaimModel, result: pvcs, to: pvcList(), groups: pvcGroups },
  ].filter(({ model }) => isServed(model));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cluster inventory</CardTitle>
      </CardHeader>
      <CardBody>
        <CardReadErrors
          reads={[
            ...rows.map(({ model, result }) => [model.labelPlural, result.error] as const),
            ['Pods (Failed)', failedPods.error] as const,
            ['Pods (Pending)', pendingPods.error] as const,
          ]}
        />
        <Stack>
          {rows.map(({ model, result, to, groups }) => (
            <StackItem key={model.plural}>
              <InventoryItem
                model={model}
                to={to}
                isLoading={result.isPending}
                error={result.error}
                count={result.data}
                groups={groups}
              />
            </StackItem>
          ))}
        </Stack>
      </CardBody>
    </Card>
  );
}
