import type { ThProps } from '@patternfly/react-table';
import type { ReactNode } from 'react';
import type { K8sModel, K8sResource } from '@/shared/k8s';
import type { FilterOption } from '@/shared/table';
import type { DataViewColumn } from '@/shared/ui';

/**
 * Descriptor shape of the resource registry (ADR-0023 §3).
 *
 * Callbacks are declared with method syntax on purpose: TypeScript checks method parameters bivariantly, so a
 * `ResourceDescriptor<PodResource>` can sit in the registry's `ResourceDescriptor[]`. That is sound in practice — the
 * generic pages only ever hand a descriptor objects of its own model's kind.
 */

/** Sidebar section a kind is listed in (spec UI-2). */
export type NavSectionId = 'home' | 'workloads' | 'networking' | 'administration';

/**
 * Status of an object: a Kubernetes status word (`Running`, `Active`) or a phrase (`1 of 3 pods`).
 * `ResourceStatusLabel` renders it with the OCP icon for that word (shared `Status`, `UX.md` §5) in the list's Status
 * cell and the details header; phrases OCP doesn't know render as text only.
 */
export interface ResourceStatus {
  title: string;
}

/**
 * One list column: a shared `DataViewColumn` (`id` is the sort and column-management key, `type: 'name'` sticky,
 * `visibility` for low-priority columns, `defaultVisible: false` for additional columns) plus all-namespaces options.
 */
export interface ColumnDef<T> extends DataViewColumn<T> {
  /** Shown only in all-namespaces mode (the Namespace column). */
  allNamespacesOnly?: boolean;
  /** `visibility` in all-namespaces mode, where the Namespace column takes the room (Pods' Owner goes first). */
  allNamespacesVisibility?: ThProps['visibility'];
}

/** A checkbox filter of the list toolbar; `id` is its URL search param (`?status=`, `?type=`). */
export interface RowFilter<T> {
  id: string;
  title: string;
  options: FilterOption[];
  /** True when `obj` matches any of the selected `values` (never called with an empty selection). */
  matches(obj: T, values: string[]): boolean;
}

/** Everything the generic pages need to render one kind. */
export interface ResourceDescriptor<T extends K8sResource = K8sResource> {
  model: K8sModel;
  nav?: { section: NavSectionId; order: number };
  columns: ColumnDef<T>[];
  filters?: RowFilter<T>[];
  /** Initial sort; defaults to the `name` column ascending. */
  defaultSort?: { columnId: string; direction: 'asc' | 'desc' };
  status?(obj: T): ResourceStatus | undefined;
  /**
   * Kind-specific fields of the Details tab (T-0075, T-0113): `DetailsItem`s only, rendered as the right column of the
   * "<Kind> details" grid next to the common metadata (`UX.md` §6). A function component
   * (`<DetailsSection obj={obj} />`), declared as a method rather than `ComponentType<{ obj: T }>` so it stays
   * bivariant like the other callbacks.
   */
  DetailsSection?(props: { obj: T }): ReactNode;
  /**
   * Further full-width sections below the details grid (Containers, Conditions, Ports, Data), each a
   * `DetailsSubsection` with its own heading. Same component shape as {@link DetailsSection}.
   */
  ExtraSections?(props: { obj: T }): ReactNode;
  /** Whether details get an Events tab; default true (false for Event itself). */
  hasEventsTab?: boolean;
  /** Delete asks to type the name (Namespace, Project). */
  deleteRequiresName?: boolean;
}
