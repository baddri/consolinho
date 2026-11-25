import { StorageClassModel } from '@/shared/k8s';
import {
  StorageClassDetails,
  StorageClassName,
  StorageClassParameters,
  StorageClassSummaryExtra,
  type StorageClassResource,
} from '../../storage/storageclasses/StorageClassDetails';
import { nameColumn } from '../columns';
import type { ResourceDescriptor } from '../types';

export type { StorageClassResource };

/**
 * StorageClasses (SC-1, OCP `storage-class.tsx`), cluster-scoped: Name with the "– Default" marker, Provisioner,
 * Reclaim policy (no Created column, as OCP). Details add binding mode, expansion and the Parameters table. No
 * Events tab, no create form (backlog).
 */
export const storageClassDescriptor: ResourceDescriptor<StorageClassResource> = {
  model: StorageClassModel,
  nav: { section: 'storage', order: 30 },
  // OCP has no Events tab on this kind (T-0310 F1).
  hasEventsTab: false,
  summary: { Extra: StorageClassSummaryExtra },
  DetailsSection: StorageClassDetails,
  ExtraSections: StorageClassParameters,
  columns: [
    { ...nameColumn<StorageClassResource>(StorageClassModel), cell: (obj) => <StorageClassName obj={obj} /> },
    {
      id: 'provisioner',
      title: 'Provisioner',
      cell: (obj) => obj.provisioner,
      sortValue: (obj) => obj.provisioner,
    },
    {
      id: 'reclaimPolicy',
      title: 'Reclaim policy',
      cell: (obj) => obj.reclaimPolicy ?? 'Delete',
      sortValue: (obj) => obj.reclaimPolicy ?? 'Delete',
    },
  ],
};
