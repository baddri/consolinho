import { parseQuantity, PersistentVolumeModel } from '@/shared/k8s';
import { DASH } from '@/shared/ui';
import { ResourceStatusLabel } from '../../components/ResourceStatusLabel';
import {
  PersistentVolumeDetails,
  PersistentVolumeSummaryExtra,
  PvClaimLink,
  type PersistentVolumeResource,
} from '../../storage/persistentvolumes/PersistentVolumeDetails';
import { pvPhase } from '../../storage/persistentvolumes/persistentVolume';
import { ageColumn, labelsColumn, nameColumn } from '../columns';
import type { ResourceDescriptor } from '../types';

export type { PersistentVolumeResource };

/**
 * PersistentVolumes (PV-1, OCP `persistent-volume.tsx`), cluster-scoped: Name, Status, Claim, Capacity, Labels,
 * Created. Details add access/volume mode, StorageClass, node affinity and the volume source. No create (backlog).
 */
export const persistentVolumeDescriptor: ResourceDescriptor<PersistentVolumeResource> = {
  model: PersistentVolumeModel,
  nav: { section: 'storage', order: 10 },
  // OCP has no Events tab on this kind (T-0310 F1).
  hasEventsTab: false,
  status: (pv) => ({ title: pvPhase(pv) }),
  summary: { Extra: PersistentVolumeSummaryExtra },
  DetailsSection: PersistentVolumeDetails,
  columns: [
    nameColumn(PersistentVolumeModel),
    {
      id: 'status',
      title: 'Status',
      cell: (pv) => <ResourceStatusLabel status={{ title: pvPhase(pv) }} />,
      sortValue: (pv) => pvPhase(pv),
    },
    {
      id: 'claim',
      title: 'Claim',
      cell: (pv) => <PvClaimLink pv={pv} />,
      sortValue: (pv) => pv.spec?.claimRef?.name ?? null,
    },
    {
      id: 'capacity',
      title: 'Capacity',
      cell: (pv) => pv.spec?.capacity?.storage ?? DASH,
      // `null` sorts last.
      sortValue: (pv) => parseQuantity(pv.spec?.capacity?.storage) ?? null,
    },
    labelsColumn(PersistentVolumeModel),
    ageColumn(),
  ],
};
