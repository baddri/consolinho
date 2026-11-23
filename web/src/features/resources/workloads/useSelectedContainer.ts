import { useCallback } from 'react';
import { useSearchParams } from 'react-router';
import type { Pod } from '@/shared/k8s';
import { containerNames, defaultContainer } from './containers';

/** Query parameter holding the selected container (OCP's `?container=`), so a Logs/Terminal URL deep-links (LOG-1). */
export const CONTAINER_PARAM = 'container';

/**
 * The container selected on a pod's Logs or Terminal tab and its setter, kept in `?container=`. Reads fall back to
 * {@link defaultContainer} when the parameter is missing or names no container of the pod — init containers count
 * only with `includeInit` (default true, as `ContainerSelect`; the Terminal passes false so `?container=<init>` can't
 * exec into a container its select doesn't offer). Writes replace the history entry and keep the other parameters.
 */
export function useSelectedContainer(
  pod: Pod,
  { includeInit = true }: { includeInit?: boolean } = {},
): [string, (name: string) => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get(CONTAINER_PARAM);
  const known =
    requested !== null &&
    (containerNames(pod).includes(requested) ||
      (includeInit && containerNames(pod, true).includes(requested)));
  const selected = known ? requested : defaultContainer(pod);
  const select = useCallback(
    (name: string) =>
      setSearchParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          next.set(CONTAINER_PARAM, name);
          return next;
        },
        { replace: true },
      ),
    [setSearchParams],
  );
  return [selected, select];
}
