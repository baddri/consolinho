import type { LabelProps } from '@patternfly/react-core';
import type { ThProps } from '@patternfly/react-table';
import type { ReactNode } from 'react';
import type { K8sModel, K8sResource } from '@/shared/k8s';
import type { FilterOption, SortValue } from '@/shared/table';

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
 * Status of an object; `ResourceStatusLabel` maps `color` to a status icon + text (red danger, orange pending, green
 * success, else neutral) in the list's Status cell and the details header.
 */
export interface ResourceStatus {
  title: string;
  color: NonNullable<LabelProps['color']>;
}

/** One list column. Only columns with `sortValue` are sortable. */
export interface ColumnDef<T> {
  /** Stable id, also the sort key (`'name'`, `'created'`). */
  id: string;
  title: string;
  cell(obj: T): ReactNode;
  sortValue?(obj: T): SortValue;
  /** Shown only in all-namespaces mode (the Namespace column). */
  allNamespacesOnly?: boolean;
  width?: 10 | 15 | 20 | 25 | 30 | 40;
  /**
   * PF responsive visibility of the header and cells (OCP's column `className`): low-priority columns use
   * `['hidden', 'visibleOnXl']` (or `…OnLg`) so narrow screens drop them instead of truncating headers.
   */
  visibility?: ThProps['visibility'];
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
   * Kind-specific part of the Details tab (T-0075), a function component (`<DetailsSection obj={obj} />`). Declared as
   * a method rather than `ComponentType<{ obj: T }>` so it stays bivariant like the other callbacks.
   */
  DetailsSection?(props: { obj: T }): ReactNode;
  /** Whether details get an Events tab; default true (false for Event itself). */
  hasEventsTab?: boolean;
  /** Delete asks to type the name (Namespace, Project). */
  deleteRequiresName?: boolean;
}
