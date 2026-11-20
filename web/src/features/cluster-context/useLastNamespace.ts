import { useCallback } from 'react';
import { useStoredValue } from '@/shared/hooks';

const STORAGE_KEY = 'fleetconsole.lastNamespace';

/** Stored instead of a name when the user last looked at all projects. */
const ALL = '#all';

type NamespaceMap = Record<string, string>;

/** Parses the stored JSON object, keeping only string values; anything malformed means "nothing remembered". */
function parseMap(raw: string): NamespaceMap | undefined {
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
    return Object.fromEntries(
      Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
    );
  } catch {
    return undefined;
  }
}

const serializeMap = (map: NamespaceMap): string => JSON.stringify(map);

/**
 * The project the user last looked at on `cluster` (NS-2), remembered per browser in
 * `localStorage['fleetconsole.lastNamespace']` as a JSON map cluster → name or `"#all"`. `undefined` means all
 * projects (also when nothing is remembered). A hint only: the project may be gone or no longer readable, which the
 * list page then reports. Written by the resource list page whenever a namespaced list renders; read by
 * `NamespaceRedirect` for the sidebar's `k8s/<plural>` links.
 */
export function useLastNamespace(
  cluster: string,
): [string | undefined, (namespace: string | undefined) => void] {
  const [map, setMap] = useStoredValue(STORAGE_KEY, parseMap, serializeMap);
  const stored = map?.[cluster];
  const remember = useCallback(
    (namespace: string | undefined) => setMap({ ...map, [cluster]: namespace ?? ALL }),
    [map, cluster, setMap],
  );
  return [stored === ALL ? undefined : stored, remember];
}
