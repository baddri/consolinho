import { SecretModel, type Secret, type K8sResource } from '@/shared/k8s';
import { ageColumn, nameColumn, namespaceColumn } from '../columns';
import type { ResourceDescriptor } from '../types';

/** A listed Secret (`metadata` always present). */
export type SecretResource = Secret & K8sResource;

/**
 * Secrets (WL-1, OCP `secret.tsx`): minimal descriptor from the CP4b foundation (T-0189) — Name, Namespace, Created. Columns,
 * details and actions are filled in by T-0196.
 */
export const secretDescriptor: ResourceDescriptor<SecretResource> = {
  model: SecretModel,
  nav: { section: 'workloads', order: 50 },
  columns: [nameColumn(SecretModel), namespaceColumn(SecretModel), ageColumn()],
};
