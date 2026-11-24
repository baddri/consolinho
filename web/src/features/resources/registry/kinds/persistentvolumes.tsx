import { PersistentVolumeModel, type K8sResource, type PersistentVolume } from '@/shared/k8s';
import { ageColumn, nameColumn } from '../columns';
import type { ResourceDescriptor } from '../types';

/** A listed PersistentVolume (`metadata` always present). */
export type PersistentVolumeResource = PersistentVolume & K8sResource;

/**
 * PersistentVolumes (OCP `persistent-volume.tsx`), cluster-scoped. Minimal descriptor from the CP5a foundation (T-0300): Name, Created; columns,
 * details and actions are filled in by T-0306.
 */
export const persistentVolumeDescriptor: ResourceDescriptor<PersistentVolumeResource> = {
  model: PersistentVolumeModel,
  nav: { section: 'storage', order: 10 },
  columns: [nameColumn(PersistentVolumeModel), ageColumn()],
};
