import { useState } from 'react';
import {
  PersistentVolumeClaimModel,
  StorageClassModel,
  useK8sGet,
  type K8sResource,
  type PersistentVolumeClaim,
  type StorageClass,
} from '@/shared/k8s';
import { disabledActionProps } from '@/shared/ui';
import { useActionAccess } from '../../actions/useActionAccess';
import type { KindActionArgs, KindActions } from '../../registry/types';
import { allowsExpansion } from '../storageclasses/storageClass';
import { ExpandPVCModal } from './ExpandPVCModal';

/** OCP's reason for PVC actions on a claim that isn't Bound (`usePVCActions.ts`). */
export const NOT_BOUND_REASON = 'PVC is not Bound';
/** *(fleet)* Reason when the claim's StorageClass has no `allowVolumeExpansion` (spec PVC-3; OCP has no such check). */
export const NO_EXPANSION_REASON = "The StorageClass doesn't allow volume expansion.";

/**
 * The PVC's own actions (OCP `usePVCActions.ts`): "Expand PVC", opening {@link ExpandPVCModal}. Never hidden; disabled
 * with the first matching reason: no `patch` access (read-only user / grant, RBAC), the claim not Bound, or (details
 * page only) a loaded StorageClass that doesn't allow expansion. List rows (`reviewByName` false) skip the StorageClass
 * get so a list opens no request per row; an SC error or missing class gives no reason (the cluster decides).
 */
export function usePVCActions({
  cluster,
  obj,
  reviewByName,
  checkAccess,
}: KindActionArgs<PersistentVolumeClaim & K8sResource>): KindActions {
  const [open, setOpen] = useState(false);
  const namespace = obj.metadata.namespace;
  const name = obj.metadata.name ?? '';
  const scName = obj.spec?.storageClassName ?? '';
  const access = useActionAccess(
    cluster,
    { model: PersistentVolumeClaimModel, verb: 'patch', namespace, name },
    reviewByName,
    checkAccess,
  );
  const storageClass = useK8sGet<StorageClass>(cluster, StorageClassModel, undefined, scName, {
    enabled: reviewByName && scName !== '',
  });

  const disabled = access.isAriaDisabled
    ? access
    : obj.status?.phase !== 'Bound'
      ? disabledActionProps(NOT_BOUND_REASON)
      : storageClass.data && !allowsExpansion(storageClass.data)
        ? disabledActionProps(NO_EXPANSION_REASON)
        : {};

  return {
    items: [
      {
        itemKey: 'expand-pvc',
        title: 'Expand PVC',
        onClick: () => {
          if (!disabled.isAriaDisabled) setOpen(true);
        },
        ...disabled,
      },
    ],
    dialog: open ? <ExpandPVCModal cluster={cluster} pvc={obj} onClose={() => setOpen(false)} /> : null,
  };
}
