import { useQuery } from '@tanstack/react-query';
import { useCallback } from 'react';
import { k8sGetPath } from './client';
import { apiVersionOf, type K8sModel } from './models';
import { k8sQueryKeys } from './queryKeys';
import type { APIGroupList, APIVersions } from './types';
import { proxyBasePath } from './url';

/**
 * Group/versions every Kubernetes cluster serves. Assumed while discovery is pending or failed, so the navigation
 * never flashes empty and OpenShift-only kinds stay hidden until the cluster confirms them (ADR-0022 §8).
 */
const BASELINE_GROUP_VERSIONS: ReadonlySet<string> = new Set(['v1', 'apps/v1']);

/** Reads `/api` (core versions) and `/apis` (groups) and returns every served `group/version` (`v1` for core). */
async function fetchServedGroupVersions(cluster: string, signal: AbortSignal): Promise<Set<string>> {
  const base = proxyBasePath(cluster);
  const [core, groups] = await Promise.all([
    k8sGetPath<APIVersions>(`${base}/api`, signal),
    k8sGetPath<APIGroupList>(`${base}/apis`, signal),
  ]);
  return new Set([
    ...core.versions,
    ...groups.groups.flatMap((group) => group.versions.map((version) => version.groupVersion)),
  ]);
}

/**
 * Which API group/versions `cluster` serves (DATA-2) — e.g. `project.openshift.io/v1` only on OpenShift. Fetched once
 * per cluster per session (`staleTime: Infinity`). `isServed(model)` answers from the {@link BASELINE_GROUP_VERSIONS}
 * while pending or on error.
 */
export function useK8sDiscovery(cluster: string): { isServed(model: K8sModel): boolean; isPending: boolean } {
  const query = useQuery({
    queryKey: k8sQueryKeys.discovery(cluster),
    queryFn: ({ signal }) => fetchServedGroupVersions(cluster, signal),
    staleTime: Infinity,
  });
  const served = query.data ?? BASELINE_GROUP_VERSIONS;
  const isServed = useCallback((model: K8sModel) => served.has(apiVersionOf(model)), [served]);
  return { isServed, isPending: query.isPending };
}
