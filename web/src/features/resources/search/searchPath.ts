import type { K8sModel } from '@/shared/k8s';
import { ALL_NAMESPACES } from '../paths';
import { toRef } from './kindRef';

/** What a {@link searchPath} preselects; every field is optional. */
export interface SearchPathOptions {
  /** A project, {@link ALL_NAMESPACES}, or absent for `/search` (the redirect to the last project). */
  namespace?: string;
  /** `?kind=` — the kinds to search, as {@link toRef} references. */
  kinds?: readonly Pick<K8sModel, 'group' | 'version' | 'kind'>[];
  /** `?q=` — label requirements (`key=value`), ANDed. */
  labels?: readonly string[];
  /** `?name=` — a name substring. */
  name?: string;
  /**
   * A query string to keep (e.g. the current one on a project switch), with or without the leading `?`. Don't combine
   * it with `kinds`/`labels`/`name`: a parameter in both would appear twice.
   */
  search?: string;
}

/** `key=a,b`: each entry URI-encoded, joined by a literal `,` as the Search page splits on it (`useSearchFilters`). */
function listParam(key: string, values: readonly string[]): string {
  return `${key}=${values.map(encodeURIComponent).join(',')}`;
}

/**
 * Path of the Search page (FRONTEND.md "Routing", SRCH-4): `/c/<cluster>/search/ns/<ns>`,
 * `/c/<cluster>/search/all-namespaces` for {@link ALL_NAMESPACES}, or `/c/<cluster>/search` without a namespace, with
 * OCP's `?kind=<ref,…>&q=<k=v,…>&name=` (`public/components/utils/label-list.tsx`). The one builder of Search links:
 * label chips on list rows and details pages use it too. Values are encoded with `encodeURIComponent` rather than
 * `URLSearchParams`, so references keep their readable `~` (`apps~v1~Deployment`) and lists their `,`, while `=` in a
 * label becomes `%3D` as in OCP.
 */
export function searchPath(cluster: string, options: SearchPathOptions = {}): string {
  const { namespace, kinds = [], labels = [], name = '', search = '' } = options;
  const params = [search.startsWith('?') ? search.slice(1) : search];
  if (kinds.length > 0) params.push(listParam('kind', kinds.map(toRef)));
  if (labels.length > 0) params.push(listParam('q', labels));
  if (name !== '') params.push(`name=${encodeURIComponent(name)}`);
  const query = params.filter((param) => param !== '').join('&');

  const base = `/c/${encodeURIComponent(cluster)}/search`;
  const scope =
    namespace === undefined ? '' : namespace === ALL_NAMESPACES ? '/all-namespaces' : `/ns/${encodeURIComponent(namespace)}`;
  return `${base}${scope}${query === '' ? '' : `?${query}`}`;
}
