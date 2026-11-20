import type { ClusterDetail, ClusterListItem } from '@/shared/api';

/**
 * A cluster as either representation carries it; both have the fields the lifecycle dialogs need (`name`,
 * `environment`, `isEnabled`, counts, `version`), so the list kebab and the detail page (T-0035) share the dialogs.
 */
export type ClusterTarget = ClusterListItem | ClusterDetail;

/** Path of a cluster's detail page. Names are DNS labels, but encode anyway like the other admin links. */
export const clusterDetailPath = (name: string) => `/admin/clusters/${encodeURIComponent(name)}`;

/** Path of a cluster's edit form. */
export const clusterEditPath = (name: string) => `${clusterDetailPath(name)}/edit`;

/** "1 user" / "3 users". */
export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}
