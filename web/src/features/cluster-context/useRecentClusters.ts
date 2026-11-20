import { useCallback, useMemo } from 'react';
import { useCurrentUser } from '@/features/auth';
import type { AccessibleCluster } from '@/shared/api';
import { useStoredValue } from '@/shared/hooks';
import { useAccessibleClusters } from './useAccessibleClusters';

/** How many recently used clusters are remembered (SW-8). */
export const MAX_RECENT_CLUSTERS = 5;

/** Parses the stored JSON array, keeping only strings; anything malformed means "no recents". */
function parseNames(raw: string): string[] | undefined {
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : undefined;
  } catch {
    return undefined;
  }
}

const serializeNames = (names: string[]): string => JSON.stringify(names);

/** Result of {@link useRecentClusters}. */
export interface RecentClusters {
  /** Recently used clusters the user still has access to, newest first. */
  recent: AccessibleCluster[];
  /** Moves `name` to the front of the list (de-duplicated, at most {@link MAX_RECENT_CLUSTERS}). */
  remember: (name: string) => void;
}

/**
 * The user's recently used clusters for the switcher's "Recent" group (SW-8), remembered per user in
 * `localStorage['fleetconsole.recentClusters.<username>']` as a JSON array of names, newest first. Names that are no
 * longer in {@link useAccessibleClusters} are hidden (not pruned, so a re-granted cluster reappears). `ClusterGate`
 * calls `remember` for every granted cluster it shows.
 */
export function useRecentClusters(): RecentClusters {
  const { data: user } = useCurrentUser();
  const { data: clusters } = useAccessibleClusters();
  const [names, setNames] = useStoredValue(
    user ? `fleetconsole.recentClusters.${user.username}` : undefined,
    parseNames,
    serializeNames,
  );

  const recent = useMemo(
    () => (names ?? []).flatMap((name) => clusters?.find((cluster) => cluster.name === name) ?? []),
    [names, clusters],
  );
  const remember = useCallback(
    (name: string) =>
      setNames([name, ...(names ?? []).filter((other) => other !== name)].slice(0, MAX_RECENT_CLUSTERS)),
    [names, setNames],
  );
  return { recent, remember };
}
