import { ConfigMapModel, type ConfigMap, type K8sResource } from '@/shared/k8s';
import { ConfigMapDetails } from '../../workloads/config/ConfigMapDetails';
import { ageColumn, nameColumn, namespaceColumn } from '../columns';
import type { ResourceDescriptor } from '../types';

/** A listed config map (`metadata` always present). */
export type ConfigMapResource = ConfigMap & K8sResource;

/** Number of keys in `data` plus `binaryData`. */
function keyCount(configMap: ConfigMap): number {
  return Object.keys(configMap.data ?? {}).length + Object.keys(configMap.binaryData ?? {}).length;
}

/**
 * ConfigMaps (UI-3, CFG-1, OCP `configmap.tsx`): Name, Namespace, Size (number of keys), Created; details show the
 * Data and Binary data sections; tabs Details and YAML only (no Events, as OCP).
 */
export const configMapDescriptor: ResourceDescriptor<ConfigMapResource> = {
  model: ConfigMapModel,
  nav: { section: 'workloads', order: 60 },
  ExtraSections: ConfigMapDetails,
  hasEventsTab: false,
  columns: [
    nameColumn(ConfigMapModel),
    namespaceColumn(ConfigMapModel),
    { id: 'keys', title: 'Size', cell: keyCount, sortValue: keyCount },
    ageColumn(),
  ],
};
