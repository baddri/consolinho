import { k8sPatch, PersistentVolumeClaimModel } from '@/shared/k8s';
import { useResourceMutation, type MutationTarget } from '../../actions/useResourceMutation';

/** What {@link useExpandPVC} writes: the claim and its new request, e.g. `20Gi`. */
export interface ExpandPVCVars extends MutationTarget {
  storage: string;
}

/**
 * Raises a claim's storage request (OCP `expand-pvc-modal.tsx`): one JSON Patch `replace /spec/resources/requests`
 * with `{ storage }`, replacing the whole `requests` object as OCP does (needs `patch persistentvolumeclaims`). The
 * CSI driver grows the volume afterwards; the details page sees `status.capacity` change through its watch. Errors
 * stay in the modal.
 */
export function useExpandPVC(cluster: string) {
  return useResourceMutation(cluster, {
    model: PersistentVolumeClaimModel,
    mutationFn: ({ namespace, name, storage }: ExpandPVCVars) =>
      k8sPatch(cluster, PersistentVolumeClaimModel, { namespace, name }, [
        { op: 'replace', path: '/spec/resources/requests', value: { storage } },
      ]),
    successMessage: ({ name, storage }) => `Expansion of ${name} to ${storage} requested`,
  });
}
