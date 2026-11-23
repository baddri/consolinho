import { SecretModel, type Secret, type K8sResource } from '@/shared/k8s';
import { SecretData, SecretSummary } from '../../workloads/config/SecretDetails';
import { ageColumn, nameColumn, namespaceColumn } from '../columns';
import type { ResourceDescriptor } from '../types';

/** A listed Secret (`metadata` always present). */
export type SecretResource = Secret & K8sResource;

/** Number of keys in `data` (OCP `sorts.dataSize`). */
function keyCount(secret: Secret): number {
  return Object.keys(secret.data ?? {}).length;
}

/**
 * Secrets (CFG-2/3, OCP `secret.tsx`): Name, Namespace, Type, Size (number of keys), Created; details show the Type
 * and the masked "Data" section with its "Reveal values" toggle; tabs Details and YAML only (no Events, as OCP).
 */
export const secretDescriptor: ResourceDescriptor<SecretResource> = {
  model: SecretModel,
  nav: { section: 'workloads', order: 50 },
  DetailsSection: SecretSummary,
  ExtraSections: SecretData,
  hasEventsTab: false,
  columns: [
    nameColumn(SecretModel),
    namespaceColumn(SecretModel),
    {
      id: 'type',
      title: 'Type',
      cell: (secret) => secret.type ?? '-',
      sortValue: (secret) => secret.type ?? '',
    },
    { id: 'size', title: 'Size', cell: keyCount, sortValue: keyCount },
    ageColumn(),
  ],
};
