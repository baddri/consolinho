import { PersistentVolumeClaimModel, StorageClassModel } from '@/shared/k8s';
import { DASH } from '@/shared/ui';
import { ResourceLink } from '../../components/ResourceLink';
import { ResourceStatusLabel } from '../../components/ResourceStatusLabel';
import {
  PersistentVolumeClaimDetails,
  PersistentVolumeClaimSections,
  PersistentVolumeClaimSummaryExtra,
  PvcVolumeLink,
  type PersistentVolumeClaimResource,
} from '../../storage/pvcs/PersistentVolumeClaimDetails';
import { usePVCActions } from '../../storage/pvcs/useExpandPVCAction';
import {
  formatBytes,
  pvcCapacityBytes,
  pvcPhase,
  pvcRequestBytes,
} from '../../storage/pvcs/persistentVolumeClaim';
import { nameColumn, namespaceColumn } from '../columns';
import type { ResourceDescriptor } from '../types';

export type { PersistentVolumeClaimResource };

/** OCP's PVC status filter options (`persistent-volume-claim.tsx` `pvcStatusFilterOptions`). */
const STATUS_FILTER_VALUES = ['Pending', 'Bound', 'Lost'] as const;

/** Bytes shown in the Capacity column: the provisioned capacity, else (not yet bound) the request. */
function listedCapacityBytes(pvc: PersistentVolumeClaimResource): number | undefined {
  return pvcCapacityBytes(pvc) ?? pvcRequestBytes(pvc);
}

/**
 * PersistentVolumeClaims (PVC-1/PVC-2, OCP `persistent-volume-claim.tsx`). List: Name, Namespace, Status,
 * PersistentVolume, Capacity (OCP binary bytes), StorageClass (no Created, as OCP); Status filter Pending / Bound / Lost. Details:
 * Label selector in the metadata column, OCP's right column plus a "Pods" item, and Conditions. Used / donut need
 * Prometheus (parity gap). Actions: Expand PVC (T-0308).
 */
export const persistentVolumeClaimDescriptor: ResourceDescriptor<PersistentVolumeClaimResource> = {
  model: PersistentVolumeClaimModel,
  nav: { section: 'storage', order: 20 },
  status: (pvc) => ({ title: pvcPhase(pvc) }),
  summary: { Extra: PersistentVolumeClaimSummaryExtra },
  DetailsSection: PersistentVolumeClaimDetails,
  ExtraSections: PersistentVolumeClaimSections,
  useKindActions: usePVCActions,
  columns: [
    nameColumn(PersistentVolumeClaimModel),
    namespaceColumn(PersistentVolumeClaimModel),
    {
      id: 'status',
      title: 'Status',
      cell: (pvc) => <ResourceStatusLabel status={{ title: pvcPhase(pvc) }} />,
      sortValue: (pvc) => pvcPhase(pvc),
    },
    {
      id: 'persistentVolume',
      title: 'PersistentVolume',
      cell: (pvc) => <PvcVolumeLink pvc={pvc} />,
      sortValue: (pvc) => pvc.spec?.volumeName ?? null,
    },
    {
      id: 'capacity',
      title: 'Capacity',
      cell: (pvc) => formatBytes(listedCapacityBytes(pvc)) ?? DASH,
      // `null` sorts last.
      sortValue: (pvc) => listedCapacityBytes(pvc) ?? null,
    },
    {
      id: 'storageClass',
      title: 'StorageClass',
      cell: (pvc) =>
        pvc.spec?.storageClassName ? (
          <ResourceLink model={StorageClassModel} name={pvc.spec.storageClassName} />
        ) : (
          DASH
        ),
      sortValue: (pvc) => pvc.spec?.storageClassName ?? null,
    },
  ],
  filters: [
    {
      id: 'status',
      title: 'Status',
      options: STATUS_FILTER_VALUES.map((value) => ({ value, label: value })),
      matches: (pvc, values) => values.includes(pvcPhase(pvc)),
    },
  ],
};
