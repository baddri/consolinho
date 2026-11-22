import { NamespaceModel, PROJECT_ANNOTATIONS, type K8sResource } from '@/shared/k8s';
import { ResourceStatusLabel } from '../../components/ResourceStatusLabel';
import { ageColumn, nameColumn } from '../columns';
import type { ColumnDef, ResourceDescriptor, ResourceStatus } from '../types';
import { NamespaceDetails, type NamespaceLike } from './NamespaceDetails';

/** `openshift.io/display-name` of a namespace or project, `undefined` when unset. */
export function displayName(obj: K8sResource): string | undefined {
  return obj.metadata.annotations?.[PROJECT_ANNOTATIONS.displayName];
}

/** `status.phase` (`Active` green check, `Terminating` ban icon, OCP `Status`), `Unknown` when unset. */
export function phaseStatus(obj: NamespaceLike): ResourceStatus {
  return { title: obj.status?.phase ?? 'Unknown' };
}

/** OCP's subtle placeholder text for an unset value ("No display name", "No requester"; `namespace.tsx`). */
export function Placeholder({ text }: { text: string }) {
  return <span className="pf-v6-u-text-color-subtle">{text}</span>;
}

/** Display name and Status columns shared by Projects and Namespaces. */
export function namespaceLikeColumns<T extends NamespaceLike>(): ColumnDef<T>[] {
  return [
    {
      id: 'displayName',
      title: 'Display name',
      cell: (obj) => displayName(obj) ?? <Placeholder text="No display name" />,
      sortValue: (obj) => displayName(obj) ?? null,
    },
    {
      id: 'status',
      title: 'Status',
      cell: (obj) => <ResourceStatusLabel status={phaseStatus(obj)} />,
      sortValue: (obj) => obj.status?.phase ?? null,
    },
  ];
}

/** Namespaces (UI-3, Administration): Name, Display name, Status, Created; delete asks for the name. */
export const namespaceDescriptor: ResourceDescriptor<NamespaceLike> = {
  model: NamespaceModel,
  nav: { section: 'administration', order: 10 },
  status: phaseStatus,
  DetailsSection: NamespaceDetails,
  deleteRequiresName: true,
  columns: [nameColumn(NamespaceModel), ...namespaceLikeColumns(), ageColumn()],
};
