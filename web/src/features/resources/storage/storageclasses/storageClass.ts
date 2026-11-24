import type { StorageClass } from '@/shared/k8s';

/** The GA and beta annotations that mark the cluster's default StorageClass (OCP `storage-class.tsx`). */
export const DEFAULT_CLASS_ANNOTATIONS = [
  'storageclass.kubernetes.io/is-default-class',
  'storageclass.beta.kubernetes.io/is-default-class',
] as const;

/** True when either default-class annotation is the string `"true"` (OCP `isDefaultClass`). */
export function isDefaultClass(sc: StorageClass): boolean {
  const annotations = sc.metadata?.annotations ?? {};
  return DEFAULT_CLASS_ANNOTATIONS.some((key) => annotations[key] === 'true');
}

/**
 * Whether claims of this class may grow (`allowVolumeExpansion`, unset = false). The PVC Expand action (T-0308)
 * gates on it.
 */
export function allowsExpansion(sc: StorageClass): boolean {
  return sc.allowVolumeExpansion === true;
}
