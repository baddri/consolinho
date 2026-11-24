import { formatBinaryBytes, parseQuantity, type PersistentVolumeClaim, type Pod } from '@/shared/k8s';

/** OCP `PVCStatusComponent`: `Terminating` while deleted, else `status.phase` (`Unknown` when unset). */
export function pvcPhase(pvc: PersistentVolumeClaim): string {
  return pvc.metadata?.deletionTimestamp ? 'Terminating' : (pvc.status?.phase ?? 'Unknown');
}

/** Bytes of the claim's provisioned capacity (`status.capacity.storage`); `undefined` until bound. */
export function pvcCapacityBytes(pvc: PersistentVolumeClaim): number | undefined {
  return parseQuantity(pvc.status?.capacity?.storage);
}

/** Bytes the claim requests (`spec.resources.requests.storage`). */
export function pvcRequestBytes(pvc: PersistentVolumeClaim): number | undefined {
  return parseQuantity(pvc.spec?.resources?.requests?.storage);
}

/**
 * A quantity of bytes as OCP prints PVC sizes (`humanizeBinaryBytes`: `10 GiB`); `undefined` stays `undefined` so
 * the caller shows its own placeholder.
 */
export function formatBytes(bytes: number | undefined): string | undefined {
  return bytes === undefined ? undefined : formatBinaryBytes(bytes);
}

/**
 * The pods that mount claim `claimName` (PVC-2): any `spec.volumes[].persistentVolumeClaim.claimName` equal to it.
 * Pure, so the caller filters one namespaced pod list; pods of other namespaces must not be passed in.
 */
export function podsMountingClaim<T extends Pod>(pods: readonly T[], claimName: string): T[] {
  return pods.filter((pod) =>
    (pod.spec?.volumes ?? []).some((volume) => volume.persistentVolumeClaim?.claimName === claimName),
  );
}
