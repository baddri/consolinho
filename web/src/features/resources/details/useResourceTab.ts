import { useMatches } from 'react-router';

/** Tabs of the resource details page, in display order; `details` is the index route (no URL segment). */
export const RESOURCE_TABS = ['details', 'yaml', 'events'] as const;
/** A tab of the resource details page. */
export type ResourceTab = (typeof RESOURCE_TABS)[number];

function tabOf(handle: unknown): string | undefined {
  if (typeof handle !== 'object' || handle === null || !('tab' in handle)) {
    return undefined;
  }
  return typeof handle.tab === 'string' ? handle.tab : undefined;
}

/**
 * The active details tab, from the deepest matched route's `handle.tab` (tabs are URL segments, ADR-0023 §1), so
 * `routes.tsx` stays the one place mapping paths to tabs. `details` when the route carries no (known) tab. Same logic
 * as the admin area's `useAdminTab`, which is not importable across features.
 */
export function useResourceTab(): ResourceTab {
  const tab = tabOf(useMatches().at(-1)?.handle);
  return RESOURCE_TABS.find((candidate) => candidate === tab) ?? 'details';
}
