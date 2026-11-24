import { useMemo } from 'react';
import { SecretModel, useK8sList, type Secret } from '@/shared/k8s';

/** The Secret types a pod can pull images with (OCP `AdvancedImageOptions` `filterData`). */
const PULL_SECRET_TYPES = new Set(['kubernetes.io/dockercfg', 'kubernetes.io/dockerconfigjson']);

/** The image pull secrets of a namespace, by name, with the list's load state. */
export interface PullSecrets {
  names: string[];
  isPending: boolean;
  /** The list failed (e.g. 403): OCP's dropdown then shows "Error loading". */
  isError: boolean;
}

/**
 * The names of `namespace`'s image pull secrets for the "Pull Secret" select. It shares the Secrets list (and watch)
 * of `useEnvSources`, so it costs no extra request. Without a namespace nothing is listed: never the cluster's Secrets.
 */
export function usePullSecrets(cluster: string, namespace: string | undefined): PullSecrets {
  const { data, isPending, error } = useK8sList<Secret>(cluster, SecretModel, {
    namespace,
    enabled: namespace !== undefined,
  });
  const names = useMemo(
    () =>
      (data ?? [])
        .filter((secret) => PULL_SECRET_TYPES.has(secret.type ?? ''))
        .map((secret) => secret.metadata?.name ?? '')
        .sort((a, b) => a.localeCompare(b)),
    [data],
  );
  return { names, isPending, isError: error !== null };
}
