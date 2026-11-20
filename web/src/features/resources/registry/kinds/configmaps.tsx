import { ConfigMapModel, type ConfigMap, type K8sResource } from '@/shared/k8s';
import { ageColumn, nameColumn, namespaceColumn } from '../columns';
import type { ResourceDescriptor } from '../types';

/** A listed config map (`metadata` always present). */
export type ConfigMapResource = ConfigMap & K8sResource;

/** Number of keys in `data` plus `binaryData`. */
function keyCount(configMap: ConfigMap): number {
  return Object.keys(configMap.data ?? {}).length + Object.keys(configMap.binaryData ?? {}).length;
}

/** ConfigMaps (UI-3): Name, Namespace, Keys, Created. */
export const configMapDescriptor: ResourceDescriptor<ConfigMapResource> = {
  model: ConfigMapModel,
  nav: { section: 'workloads', order: 30 },
  columns: [
    nameColumn(ConfigMapModel),
    namespaceColumn(ConfigMapModel),
    { id: 'keys', title: 'Keys', cell: keyCount, sortValue: keyCount },
    ageColumn(),
  ],
};
