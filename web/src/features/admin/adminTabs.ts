import { useMatches } from 'react-router';

/** Tabs of the user detail page, in display order; each is a URL segment (`/admin/users/:username[/access]`). */
export const USER_DETAIL_TABS = ['details', 'access'] as const;
/** A tab of the user detail page. */
export type UserDetailTab = (typeof USER_DETAIL_TABS)[number];

/**
 * Tabs of the cluster detail page, in display order; each is a URL segment
 * (`/admin/clusters/:name[/credentials|/access]`).
 */
export const CLUSTER_DETAIL_TABS = ['details', 'credentials', 'access'] as const;
/** A tab of the cluster detail page. */
export type ClusterDetailTab = (typeof CLUSTER_DETAIL_TABS)[number];

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
