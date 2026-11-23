import type { ThProps } from '@patternfly/react-table';
import type { ReactNode } from 'react';
import type { K8sModel, K8sResource } from '@/shared/k8s';
import type { FilterOption } from '@/shared/table';
import type { DataViewColumn, DisabledActionProps } from '@/shared/ui';

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

/**
 * Optional rows of the Details tab's common metadata column, in OCP `ResourceSummary` order (`details-page.tsx`):
 * Pod selector, Node selector and Tolerations after Labels, `Extra` (e.g. a deployment's Status) after Annotations.
 * A row shows when its getter is declared, even for an empty value. Method syntax keeps them bivariant.
 */
export interface SummaryFields<T> {
  podSelector?(obj: T): Record<string, string> | undefined;
  nodeSelector?(obj: T): Record<string, string> | undefined;
  tolerations?(obj: T): readonly unknown[] | undefined;
  /** `DetailsItem`s between Annotations and "Created at", as OCP `ResourceSummary`'s children. */
  Extra?(props: { obj: T }): ReactNode;
}

/** A details tab only some kinds have, opted in by {@link ResourceDescriptor.extraTabs}. */
export type KindTab = 'replicasets' | 'replicationcontrollers' | 'jobs' | 'logs' | 'terminal';

/**
 * One resource action (ADR-0037 §3). Assignable to PatternFly's `IAction` as is (row `ActionsColumn`); the details
 * Actions dropdown maps it to `DropdownItem`s. Disabled items stay visible, with a tooltip once the reason is known.
 */
export interface ResourceActionItem extends DisabledActionProps {
  /**
   * Unique per kind: kind items use kebab-case keys of their own; the common ones are `edit-labels`,
   * `edit-annotations`, `edit` and `delete` (OCP `useCommonActions` ids).
   */
  itemKey: string;
  title: string;
  onClick: () => void;
}

/** What a kind's {@link ResourceDescriptor.useKindActions} hook gets. */
export interface KindActionArgs<T extends K8sResource = K8sResource> {
  cluster: string;
  obj: T;
  /** Whether access checks name the object (details page) or stay namespace-level (list rows, ADR-0022 §9). */
  reviewByName: boolean;
}

/** A kind's own actions: menu items shown before the common ones, and the one dialog they may have open. */
export interface KindActions {
  items: ResourceActionItem[];
  /** The open kind dialog, or `null`. */
  dialog: ReactNode;
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
  /** No status badge in the details heading (OCP Deployment: status is a "Status" row of the Details tab instead). */
  hideHeadingStatus?: boolean;
  /** Extra rows of the common metadata column ({@link SummaryFields}). */
  summary?: SummaryFields<T>;
  /** Shown under the "<Kind> details" heading above the grid, e.g. a deployment's pod ring. */
  DetailsTop?(props: { obj: T }): ReactNode;
  /**
   * Kind-specific fields of the Details tab (T-0075, T-0113): `DetailsItem`s only, rendered as the right column of the
   * "<Kind> details" grid next to the common metadata (`UX.md` §6). A function component
   * (`<DetailsSection obj={obj} />`), declared as a method rather than `ComponentType<{ obj: T }>` so it stays
   * bivariant like the other callbacks.
   */
  DetailsSection?(props: { obj: T }): ReactNode;
  /** Heading over the {@link DetailsSection} column, e.g. OCP's "Job status"; none when unset. */
  detailsTitle?: string;
  /**
   * Further full-width sections below the details grid (Containers, Conditions, Ports, Data), each a
   * `DetailsSubsection` with its own heading. Same component shape as {@link DetailsSection}.
   */
  ExtraSections?(props: { obj: T }): ReactNode;
  /**
   * Label selector of the object's pods: declaring it adds a Pods tab (OCP workloads' `/pods` tab) listing the pods
   * that match, and is where the "N of M pods" status links.
   */
  podsSelector?(obj: T): Record<string, string> | undefined;
  /**
   * The Pods tab's content for a kind whose pods no label selector expresses (CronJob: the pods of the Jobs it owns,
   * OCP `CronJobPodsComponent`). Declaring it adds the Pods tab like {@link podsSelector}; same component shape as
   * {@link DetailsSection}.
   */
  PodsTab?(props: { cluster: string; obj: T }): ReactNode;
  /**
   * How the list page renders: `table` (default, `ConsoleDataView`) or `eventStream`, OCP's live stream of event cards
   * with its own toolbar (Event only, `UX.md` §6a).
   */
  listLayout?: 'table' | 'eventStream';
  /**
   * Kind-specific details tabs (ADR-0037 §2): Deployment `['replicasets']`, Pod `['logs', 'terminal']`. Their position
   * comes from `RESOURCE_TABS`, not from this list.
   */
  extraTabs?: readonly KindTab[];
  /** Whether details get an Events tab; default true (false for Event itself). */
  hasEventsTab?: boolean;
  /**
   * The kind's own actions (ADR-0037 §3), listed before the common ones in the row kebab and the details Actions
   * menu. A hook: it is called on every render of the menu, which is keyed by the model so a kind change remounts.
   * Every mutating item gates itself with `useActionAccess`.
   */
  useKindActions?(args: KindActionArgs<T>): KindActions;
  /** Delete asks to type the name (Namespace, Project). */
  deleteRequiresName?: boolean;
}
