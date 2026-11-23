import { ALL_NAMESPACES } from '../paths';

/**
 * Path of the Search page (FRONTEND.md "Routing"): `/c/<cluster>/search/ns/<ns>`, `/c/<cluster>/search/all-namespaces`
 * for {@link ALL_NAMESPACES}, or `/c/<cluster>/search` (the redirect to the last project) without a namespace.
 * `search` is a query string to keep, with or without the leading `?`.
 */
export function searchPath(cluster: string, namespace?: string, search = ''): string {
  const base = `/c/${encodeURIComponent(cluster)}/search`;
  const query = search === '' || search.startsWith('?') ? search : `?${search}`;
  if (namespace === undefined) return `${base}${query}`;
  if (namespace === ALL_NAMESPACES) return `${base}/all-namespaces${query}`;
  return `${base}/ns/${encodeURIComponent(namespace)}${query}`;
}
