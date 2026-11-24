import { useMatches } from 'react-router';
import type { PageTab } from '@/shared/ui';

/**
 * Tabs of the user detail page, in display order; each is a URL segment
 * (`/fleet/admin/users/:username[/access|/effective-access]`).
 */
export const USER_DETAIL_TABS = ['details', 'access', 'effective-access'] as const;
/** A tab of the user detail page. */
export type UserDetailTab = (typeof USER_DETAIL_TABS)[number];
/** Tab titles of the user detail page, also the accessible names of their panels. */
export const USER_DETAIL_TAB_TITLES: Record<UserDetailTab, string> = {
  details: 'Details',
  access: 'Cluster access',
  'effective-access': 'Effective access',
};

/**
 * Tabs of the cluster detail page, in display order; each is a URL segment
 * (`/fleet/admin/clusters/:name[/credentials|/access]`).
 */
export const CLUSTER_DETAIL_TABS = ['details', 'credentials', 'access'] as const;
/** A tab of the cluster detail page. */
export type ClusterDetailTab = (typeof CLUSTER_DETAIL_TABS)[number];
/** Tab titles of the cluster detail page, also the accessible names of their panels. */
export const CLUSTER_DETAIL_TAB_TITLES: Record<ClusterDetailTab, string> = {
  details: 'Details',
  credentials: 'Credentials',
  access: 'Access',
};

/**
 * Tabs of the group detail page, in display order; each is a URL segment
 * (`/fleet/admin/groups/:groupName[/access]`).
 */
export const GROUP_DETAIL_TABS = ['details', 'access'] as const;
/** A tab of the group detail page. */
export type GroupDetailTab = (typeof GROUP_DETAIL_TABS)[number];
/** Tab titles of the group detail page, also the accessible names of their panels. */
export const GROUP_DETAIL_TAB_TITLES: Record<GroupDetailTab, string> = {
  details: 'Details',
  access: 'Cluster access',
};

/**
 * `PageTabs` entries of a detail page at `basePath` (e.g. `/fleet/admin/users/alice`, already encoded): the first tab
 * is the index route (`basePath` itself), every other one the URL segment named like its key (FRONTEND.md "Routing").
 */
export function detailPageTabs<T extends string>(
  tabs: readonly [T, ...T[]],
  titles: Record<T, string>,
  basePath: string,
): PageTab[] {
  return tabs.map((key, index) => ({
    key,
    title: titles[key],
    to: index === 0 ? basePath : `${basePath}/${key}`,
  }));
}

/** `handle` of an admin route that renders a non-index tab of a detail page. Set only in `routes.tsx`. */
export interface AdminTabHandle {
  tab: string;
}

function tabOf(handle: unknown): string | undefined {
  if (typeof handle !== 'object' || handle === null || !('tab' in handle)) {
    return undefined;
  }
  return typeof handle.tab === 'string' ? handle.tab : undefined;
}

/**
 * The active tab of a detail page, taken from the deepest matched route's `handle` (tabs are URL segments,
 * FRONTEND.md "Routing"), so `routes.tsx` stays the one place that maps paths to tabs. Returns `tabs[0]` (the index
 * route's tab, `details`) when the route carries no tab or one the page doesn't know.
 */
export function useAdminTab<const T extends string>(tabs: readonly [T, ...T[]]): T {
  const tab = tabOf(useMatches().at(-1)?.handle);
  return tabs.find((candidate) => candidate === tab) ?? tabs[0];
}
