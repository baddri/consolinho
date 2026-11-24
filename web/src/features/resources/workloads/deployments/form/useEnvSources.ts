import { useMemo } from 'react';
import { ConfigMapModel, SecretModel, useK8sList, type ConfigMap, type Secret } from '@/shared/k8s';

/** A ConfigMap or Secret an env var can reference, with only its key names (never Secret values; CFG-4). */
export interface EnvSource {
  kind: 'ConfigMap' | 'Secret';
  name: string;
  keys: string[];
}

/** The ConfigMaps and Secrets of a namespace, by name. */
export interface EnvSources {
  configMaps: EnvSource[];
  secrets: EnvSource[];
}

function toSources(kind: EnvSource['kind'], items: (ConfigMap | Secret)[] | undefined): EnvSource[] {
  return (items ?? [])
    .map((item) => ({ kind, name: item.metadata?.name ?? '', keys: Object.keys(item.data ?? {}).sort() }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The ConfigMaps and Secrets of `namespace` for the "Add from ConfigMap or Secret" selects (OCP `EnvironmentField`
 * lists both). Keys come from `data` only, as OCP. A list the user may not read (403) is simply empty, as OCP.
 * Without a namespace nothing is listed: never the cluster's Secrets.
 */
export function useEnvSources(cluster: string, namespace: string | undefined): EnvSources {
  const enabled = namespace !== undefined;
  const configMaps = useK8sList<ConfigMap>(cluster, ConfigMapModel, { namespace, enabled }).data;
  const secrets = useK8sList<Secret>(cluster, SecretModel, { namespace, enabled }).data;
  return useMemo(
    () => ({ configMaps: toSources('ConfigMap', configMaps), secrets: toSources('Secret', secrets) }),
    [configMaps, secrets],
  );
}
