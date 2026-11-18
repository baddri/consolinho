import { useQuery } from '@tanstack/react-query';
import { apiClient } from './client';
import type { components } from './schema.gen';

/** Build/runtime information about the FleetConsole deployment. */
export type SystemInfo = components['schemas']['SystemInfo'];

/** Query key for {@link useSystemInfo}. Not cluster-scoped: the data describes FleetConsole itself. */
export const systemInfoQueryKey = ['api', 'system', 'info'] as const;

/**
 * Loads `GET /api/system/info` (version and environment name of this FleetConsole instance).
 *
 * The value only changes on redeploy, so it is cached for the lifetime of the page.
 */
export function useSystemInfo() {
  return useQuery({
    queryKey: systemInfoQueryKey,
    queryFn: async ({ signal }): Promise<SystemInfo> => {
      const { data, response } = await apiClient.GET('/api/system/info', { signal });
      if (!response.ok || data === undefined) {
        throw new Error(`Failed to load system info (HTTP ${response.status})`);
      }
      return data;
    },
    staleTime: Infinity,
  });
}
