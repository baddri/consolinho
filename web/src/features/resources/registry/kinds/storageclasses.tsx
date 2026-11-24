import { StorageClassModel } from '@/shared/k8s';
import {
  StorageClassDetails,
  StorageClassName,
  StorageClassParameters,
  StorageClassSummaryExtra,
  type StorageClassResource,
} from '../../storage/storageclasses/StorageClassDetails';
import { ageColumn, nameColumn } from '../columns';
import type { ResourceDescriptor } from '../types';

export type { StorageClassResource };

/**
 * StorageClasses (SC-1, OCP `storage-class.tsx`), cluster-scoped: Name with the "– Default" marker, Provisioner,
 * Reclaim policy, Created. Details add binding mode, expansion and the Parameters table. No create form (backlog).
 */
export const storageClassDescriptor: ResourceDescriptor<StorageClassResource> = {
  model: StorageClassModel,
  nav: { section: 'storage', order: 30 },
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
    ageColumn(),
  ],
};
