import { PersistentVolumeClaimModel, type K8sResource, type PersistentVolumeClaim } from '@/shared/k8s';
import { ageColumn, nameColumn, namespaceColumn } from '../columns';
import type { ResourceDescriptor } from '../types';

/** A listed PersistentVolumeClaim (`metadata` always present). */
export type PersistentVolumeClaimResource = PersistentVolumeClaim & K8sResource;

/**
 * PersistentVolumeClaims (OCP `persistent-volume-claim.tsx`). Minimal descriptor from the CP5a foundation (T-0300): Name, Namespace, Created; columns,
 * details and actions are filled in by T-0307 (Expand: T-0308).
 */
export const persistentVolumeClaimDescriptor: ResourceDescriptor<PersistentVolumeClaimResource> = {
  model: PersistentVolumeClaimModel,
  nav: { section: 'storage', order: 20 },
  columns: [nameColumn(PersistentVolumeClaimModel), namespaceColumn(PersistentVolumeClaimModel), ageColumn()],
};
