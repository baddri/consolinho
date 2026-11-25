import { SubscriptionModel, useCanI, useK8sList } from '@/shared/k8s';
import { StatusIconText } from '@/shared/ui';
import { useResourceRoute } from '../resourceRoute';
import { upgradeRequiresApproval, type SubscriptionResource } from './csv';

/**
 * A Subscription's state as OCP `SubscriptionStatus` words it, with the matching status icon: "Upgrade available",
 * "Upgrading", "Up to date", else the raw state ("Unknown failure" in subtle text without one).
 */
export function SubscriptionStatus({
  subscription,
  requiresApproval,
}: {
  /** `undefined` when no Subscription installed the CSV: OCP still shows "Unknown failure". */
  subscription: SubscriptionResource | undefined;
  requiresApproval: boolean;
}) {
  const state = subscription?.status?.state;
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
      return (
        <span className={state ? undefined : 'pf-v6-u-text-color-subtle'}>{state ?? 'Unknown failure'}</span>
      );
  }
}

/**
 * The Subscription status line of an Installed Operators row (OCP list `SubscriptionStatus muted`): "Upgrade available"
 * (also when the pending upgrade awaits approval), "Upgrading" or "Up to date"; `undefined` for any other state or
 * without a Subscription, so the row shows no line. Plain text — the tab's {@link SubscriptionStatus} carries icons.
 */
export function subscriptionStatusTitle(subscription: SubscriptionResource | undefined): string | undefined {
  switch (subscription?.status?.state) {
    case 'UpgradeAvailable':
      return 'Upgrade available';
    case 'UpgradePending':
      return upgradeRequiresApproval(subscription) ? 'Upgrade available' : 'Upgrading';
    case 'AtLatestKnown':
      return 'Up to date';
    default:
      return undefined;
  }
}

/**
 * The Subscriptions behind the Installed Operators list's Status cells (OCP `ClusterServiceVersionsPage` resources):
 * all namespaces when the list is, or when the user may list Subscriptions cluster-wide (a copied CSV's Subscription
 * lives in the operator's namespace), else the route's namespace. Every cell calls this; they share one live list
 * query, so the page makes one Subscriptions request, never one per row. `undefined` while loading or on error.
 */
export function useCsvSubscriptions(): SubscriptionResource[] | undefined {
  const { cluster, scope, namespace } = useResourceRoute();
  const allNamespaces = scope !== 'ns';
  const { allowed } = useCanI(
    cluster,
    { verb: 'list', model: SubscriptionModel },
    { enabled: !allNamespaces },
  );
  const clusterWide = allNamespaces || allowed === true;
  const { data, error } = useK8sList<SubscriptionResource>(cluster, SubscriptionModel, {
    namespace: clusterWide ? undefined : namespace,
    enabled: cluster !== '' && (allNamespaces || allowed !== undefined),
  });
  return error ? undefined : data;
}
