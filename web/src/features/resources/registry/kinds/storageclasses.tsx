import { StorageClassModel, type K8sResource, type StorageClass } from '@/shared/k8s';
import { ageColumn, nameColumn } from '../columns';
import type { ResourceDescriptor } from '../types';

/** A listed StorageClass (`metadata` always present). */
export type StorageClassResource = StorageClass & K8sResource;

/**
 * StorageClasses (OCP `storage-class.tsx`), cluster-scoped. Minimal descriptor from the CP5a foundation (T-0300): Name, Created; columns,
 * details and actions are filled in by T-0306.
 */
export const storageClassDescriptor: ResourceDescriptor<StorageClassResource> = {
  model: StorageClassModel,
  nav: { section: 'storage', order: 30 },
  columns: [nameColumn(StorageClassModel), ageColumn()],
};
