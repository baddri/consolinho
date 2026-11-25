import type { ThProps } from '@patternfly/react-table';
import type { ReactNode } from 'react';
import type { K8sModel, K8sResource, LabelSelector } from '@/shared/k8s';
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
export type NavSectionId =
  'home' | 'operators' | 'workloads' | 'networking' | 'storage' | 'compute' | 'administration';

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
  /** The pod selector; plain-map kinds (DeploymentConfig, ReplicationController) wrap it as `{ matchLabels }`. */
  podSelector?(obj: T): LabelSelector | undefined;
  nodeSelector?(obj: T): Record<string, string> | undefined;
  tolerations?(obj: T): readonly unknown[] | undefined;
  /** `DetailsItem`s between Annotations and "Created at", as OCP `ResourceSummary`'s children. */
  Extra?(props: { obj: T }): ReactNode;
}

/** A details tab only some kinds have, opted in by {@link ResourceDescriptor.extraTabs}. */
export type KindTab =
  | 'replicasets'
  | 'replicationcontrollers'
  | 'machines'
  | 'subscription'
  | 'related-objects'
  | 'jobs'
  | 'logs'
  | 'terminal';

/** Kind tabs whose body is the descriptor's own component ({@link ResourceDescriptor.KindTabs}), no shared module. */
export type DescriptorTab = 'machines' | 'subscription' | 'related-objects';

/**
 * Components of the {@link DescriptorTab}s, keyed by tab. Method syntax keeps them bivariant like the descriptor's
 * other callbacks (a property of function type would not let a `ResourceDescriptor<MachineSet>` sit in the registry).
 */
export interface KindTabComponents<T> {
  machines?(props: { cluster: string; obj: T }): ReactNode;
  subscription?(props: { cluster: string; obj: T }): ReactNode;
  'related-objects'?(props: { cluster: string; obj: T }): ReactNode;
}

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
  /** Sidebar entry; `label` overrides `model.labelPlural` (CSVs are OCP's "Installed Operators"). */
  nav?: { section: NavSectionId; order: number; label?: string };
  /**
   * OCP shows the kind without edit actions (MS-3, OLM-5, `UX.md` §5 "Read-only kinds"): only the kind's own actions,
   * no Edit labels/annotations/<Kind> or Delete, and a read-only YAML tab with a notice, whatever the user's access.
   */
  readOnly?: true;
  /**
   * Label selector ANDed with the user's `?label=` filter on the all-namespaces list only (OLM-1: `!olm.copiedFrom`
   * hides the CSV copies OLM places in every target namespace). A `LabelSelector` so `matchExpressions` express it.
   */
  allNamespacesLabelSelector?: LabelSelector;
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
  /**
   * Replaces the whole two-column grid under "<Kind> details" (common metadata column and {@link DetailsSection})
   * for kinds whose OCP overview interleaves metadata with kind fields in its own order, e.g. OCP
   * `NodeDetailsOverview`. The component renders its own `DetailsGrid` and, if it shows Labels/Annotations, their
   * edit affordances. Same component shape as {@link DetailsSection}; `DetailsTop` and `ExtraSections` still render.
   */
  DetailsOverview?(props: { obj: T }): ReactNode;
  /** Heading over the {@link DetailsSection} column, e.g. OCP's "Job status"; none when unset. */
  detailsTitle?: string;
  /**
   * Further full-width sections below the details grid (Containers, Conditions, Ports, Data), each a
   * `DetailsSubsection` with its own heading. Same component shape as {@link DetailsSection}.
   */
  ExtraSections?(props: { obj: T }): ReactNode;
  /**
   * Label selector of the object's pods: declaring it adds a Pods tab (OCP workloads' `/pods` tab) listing the pods
   * that match, and is where the "N of M pods" status links. The full selector, `matchExpressions` included (OCP
   * `selectorToString`); plain-map kinds wrap theirs as `{ matchLabels }`.
   */
  podsSelector?(obj: T): LabelSelector | undefined;
  /**
   * The Pods tab shows Node instead of Owner (OCP `showNodes`): set where the owner is the page itself and the node is
   * what triage needs (DaemonSet, Job).
   */
  podsShowNodes?: true;
  /**
   * The Pods tab's content for a kind whose pods no label selector expresses (CronJob: the pods of the Jobs it owns,
   * OCP `CronJobPodsComponent`). Declaring it adds the Pods tab like {@link podsSelector}; same component shape as
   * {@link DetailsSection}.
   */
  PodsTab?(props: { cluster: string; obj: T }): ReactNode;
  /**
   * Bodies of the descriptor-owned kind tabs (MachineSet Machines, CSV Subscription, ClusterOperator Related objects):
   * a tab shows only when listed in {@link extraTabs} **and** given a component here. Same shape as {@link PodsTab}.
   */
  KindTabs?: KindTabComponents<T>;
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
   * The kind has a full-page edit form at `…/<name>/form` (FORM-4, OCP's Edit Deployment): the Edit action opens it
   * instead of the YAML tab. Its route is registered in `routes.tsx`.
   */
  hasEditForm?: true;
  /**
   * The kind's own actions (ADR-0037 §3), listed before the common ones in the row kebab and the details Actions
   * menu. A hook: it is called on every render of the menu, which is keyed by the model so a kind change remounts.
   * Every mutating item gates itself with `useActionAccess`.
   */
  useKindActions?(args: KindActionArgs<T>): KindActions;
  /** Delete asks to type the name (Namespace, Project). */
  deleteRequiresName?: boolean;
  /**
   * An alert under the list and details page headings (OCP `ListPage` / `DetailsPage` `helpAlert`), e.g.
   * DeploymentConfig's deprecation notice. Same component shape as {@link DetailsSection}.
   */
  HeadingAlert?(props: { cluster: string }): ReactNode;
  /**
   * Buttons in the list page heading (OCP `ListPage` `createButtonText` / `createProps`), e.g. Projects' Create
   * Project (T-0309). Same component shape as {@link HeadingAlert}; each button gates itself on access.
   */
  ListActions?(props: { cluster: string }): ReactNode;
}
