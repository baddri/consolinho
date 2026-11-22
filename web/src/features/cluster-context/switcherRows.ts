import type { AccessibleCluster } from '@/shared/api';
import { clusterTypeText, environmentLabel } from '@/shared/ui';

/**
 * Menu item id of the "Fleet management" entry. `:` can't occur in a DNS-1123 cluster name, so it never collides
 * with a cluster's item id (ADR-0033 §6).
 */
export const FLEET_ITEM_ID = 'fleet:management';

/** Menu item id of the "Clusters unavailable — retry" row; refetches instead of navigating. */
export const RETRY_ITEM_ID = 'clusters:retry';

/**
 * One row of the cluster switcher menu. `key` is unique across the whole menu (`${section.id}:…`): a cluster can be
 * listed in both Recent and All clusters, so its `itemId` (the cluster name) is not. The `key` is the React key, the
 * keyboard focus state and — prefixed with the component's `useId()` — the row's DOM id.
 */
export type SwitcherRow =
  | { kind: 'fleet'; key: string; itemId: typeof FLEET_ITEM_ID }
  | { kind: 'cluster'; key: string; itemId: string; cluster: AccessibleCluster }
  | { kind: 'retry'; key: string; itemId: typeof RETRY_ITEM_ID }
  /** Disabled explanation ("Loading clusters", "No clusters", …); never focusable. */
  | { kind: 'status'; key: string; text: string };

/** A row the keyboard can move to: every kind except `status`. */
export type FocusableRow = Exclude<SwitcherRow, { kind: 'status' }>;

/** One `MenuList` of the menu; `groupLabel` wraps it in a labelled `MenuGroup` (only when Recent is shown). */
export interface SwitcherSection {
  id: 'fleet' | 'recent' | 'all';
  ariaLabel: string;
  groupLabel?: string;
  rows: SwitcherRow[];
}

/** Inputs of {@link buildSwitcherSections}; all already resolved by the component's hooks. */
export interface SwitcherSectionsInput {
  isAdmin: boolean;
  /** The accessible clusters; `undefined` while loading or after a failed first load. */
  clusters: readonly AccessibleCluster[] | undefined;
  hasError: boolean;
  recent: readonly AccessibleCluster[];
  /** The cluster the toggle shows (none in the fleet perspective). */
  shownName: string | undefined;
  searchText: string;
}

/**
 * Case-insensitive substring match over name, display name, environment — both the enum value ("production") and
 * the label text ("prod") — and cluster type — tag ("OCP", "K8s") and word ("OpenShift", "Kubernetes") — so users
 * can type what they see or what they mean (SW-6, SW-7).
 */
function matchesSearch(cluster: AccessibleCluster, needle: string): boolean {
  const type = clusterTypeText(cluster.distribution);
  const fields = [
    type.tag,
    type.word,
    cluster.name,
    cluster.displayName,
    cluster.environment,
    environmentLabel(cluster.environment).text,
  ];
  return fields.some((field) => field.toLowerCase().includes(needle));
}

/**
 * "All clusters" body when there is nothing to pick: the menu can open before or without a cluster list (fleet
 * perspective; an admin whose list failed or is empty), so it says why instead of listing nothing. A failed list
 * gets the enabled {@link RETRY_ITEM_ID} row instead.
 */
function clusterListStatus(clusters: readonly AccessibleCluster[] | undefined, searchText: string): string {
  if (!clusters) return 'Loading clusters';
  if (clusters.length === 0) return 'No clusters';
  return `No clusters match "${searchText}"`;
}

const clusterRow = (sectionId: SwitcherSection['id'], cluster: AccessibleCluster): SwitcherRow => ({
  kind: 'cluster',
  key: `${sectionId}:${cluster.name}`,
  itemId: cluster.name,
  cluster,
});

/**
 * The switcher menu's sections in render order — Fleet (admins), Recent, All clusters. The single source for both
 * what the menu renders and the keyboard focus order ({@link focusOrder}), so the two can't drift apart (T-0153).
 */
export function buildSwitcherSections(input: SwitcherSectionsInput): SwitcherSection[] {
  const { isAdmin, clusters, hasError, recent, shownName, searchText } = input;
  const all = clusters ?? [];
  const needle = searchText.trim().toLowerCase();
  const matches = needle ? all.filter((cluster) => matchesSearch(cluster, needle)) : all;
  // Hidden while searching, and when it would only repeat "All clusters" (e.g. a single granted cluster) or hold
  // nothing but the cluster already checked in "All clusters" (T-0119 item 8).
  const showRecent =
    !needle && recent.length < all.length && recent.some((cluster) => cluster.name !== shownName);
  const showRetry = !clusters && hasError;

  const sections: SwitcherSection[] = [];
  // Independent of the search: the perspective entry stays while filtering clusters (FLEET-1).
  if (isAdmin) {
    sections.push({
      id: 'fleet',
      ariaLabel: 'Fleet',
      rows: [{ kind: 'fleet', key: 'fleet:management', itemId: FLEET_ITEM_ID }],
    });
  }
  if (showRecent) {
    sections.push({
      id: 'recent',
      ariaLabel: 'Recent clusters',
      groupLabel: 'Recent',
      rows: recent.map((cluster) => clusterRow('recent', cluster)),
    });
  }
  let allRows: SwitcherRow[];
  if (showRetry) allRows = [{ kind: 'retry', key: 'all:retry', itemId: RETRY_ITEM_ID }];
  else if (matches.length > 0) allRows = matches.map((cluster) => clusterRow('all', cluster));
  else
    allRows = [{ kind: 'status', key: 'all:status', text: clusterListStatus(clusters, searchText.trim()) }];
  sections.push({
    id: 'all',
    ariaLabel: 'All clusters',
    groupLabel: showRecent ? 'All clusters' : undefined,
    rows: allRows,
  });
  return sections;
}

/** The clusters listed under "All clusters" — the search matches; Enter with no focused row opens the first (SW-7). */
export function matchingClusters(sections: readonly SwitcherSection[]): AccessibleCluster[] {
  const all = sections.find((section) => section.id === 'all');
  return (all?.rows ?? []).flatMap((row) => (row.kind === 'cluster' ? [row.cluster] : []));
}

/** Focusable rows in render order: every row except `status`. */
export function focusOrder(sections: readonly SwitcherSection[]): FocusableRow[] {
  return sections.flatMap((section) =>
    section.rows.filter((row): row is FocusableRow => row.kind !== 'status'),
  );
}

/**
 * Next focused key for ArrowUp/ArrowDown. Wraps at both ends (like PF's menu keyboard handler); an unknown or `null`
 * current key starts at the first row (Down) or the last (Up); `null` when nothing is focusable.
 */
export function nextFocusKey(
  order: readonly SwitcherRow[],
  current: string | null,
  key: 'ArrowUp' | 'ArrowDown',
): string | null {
  if (order.length === 0) return null;
  const index = order.findIndex((row) => row.key === current);
  const step = key === 'ArrowDown' ? 1 : -1;
  const next =
    index === -1 ? (step === 1 ? 0 : order.length - 1) : (index + step + order.length) % order.length;
  return order[next]?.key ?? null;
}
