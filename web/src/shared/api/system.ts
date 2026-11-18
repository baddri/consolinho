import { useQuery } from '@tanstack/react-query';
import { apiClient } from './client';
import { unwrap } from './errors';
import type { SystemInfo } from './types';

/** Query key for {@link useSystemInfo}. Not cluster-scoped: the data describes FleetConsole itself. */
export const systemInfoQueryKey = ['api', 'system', 'info'] as const;

/**
 * Loads `GET /api/system/info` (version and environment name of this FleetConsole instance).
 *
 * The value only changes on redeploy, so it is cached for the lifetime of the page. Failures are `ApiError`s.
 */
export function useSystemInfo() {
  return useQuery({
    queryKey: systemInfoQueryKey,
    queryFn: ({ signal }): Promise<SystemInfo> => unwrap(apiClient.GET('/api/system/info', { signal })),
    staleTime: Infinity,
  });
}
