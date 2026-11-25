import { ClusterVersionModel, useK8sDiscovery, type K8sModel } from '@/shared/k8s';
import { clusterOverviewPath, clusterSettingsPath, resourcePath } from '../paths';
import { searchPath } from '../search/searchPath';
import { resourceDescriptors } from '../registry/registry';
import type { NavSectionId } from '../registry/types';

/** One link in the sidebar. */
export interface NavLinkItem {
  label: string;
  to: string;
  /** Whether the item should be highlighted for the current path (e.g. any namespace of a namespaced list). */
  isActive: (pathname: string) => boolean;
}

/** A collapsible sidebar section. */
export interface NavSection {
  id: string;
  title: string;
  items: NavLinkItem[];
}

/** Section order and titles of the cluster navigation (spec UI-2, NAV-1, OCP `console-extensions.json` order). */
const SECTIONS: readonly { id: NavSectionId; title: string }[] = [
  { id: 'home', title: 'Home' },
  { id: 'operators', title: 'Operators' },
  { id: 'workloads', title: 'Workloads' },
  { id: 'networking', title: 'Networking' },
  { id: 'storage', title: 'Storage' },
  { id: 'compute', title: 'Compute' },
  { id: 'administration', title: 'Administration' },
];

/** A sidebar item that isn't a kind's list, placed among the registry items of its section by `order`. */
export interface StaticNavItem {
  section: NavSectionId;
  order: number;
  label: string;
  path: (cluster: string) => string;
  isActive: (pathname: string) => boolean;
  /** Shown only when discovery serves this model (OCP `flags.required`, e.g. Cluster Settings needs ClusterVersion). */
  requires?: K8sModel;
}

/**
 * OCP Home: Overview, Projects, Search, API Explorer, Events — Overview first, Search between Projects (10) and Events
 * (20). Administration: Cluster Settings before Namespaces (10).
 */
export const STATIC_NAV_ITEMS: readonly Readonly<StaticNavItem>[] = [
  {
    section: 'home',
    order: 0,
    label: 'Overview',
    path: (cluster) => clusterOverviewPath(cluster),
    isActive: (pathname) => /^\/c\/[^/]+\/overview(?:\/|$)/.test(pathname),
  },
  {
    section: 'administration',
    order: 5,
    label: 'Cluster Settings',
    path: (cluster) => clusterSettingsPath(cluster),
    // OCP `startsWith: config.openshift.io`: ClusterOperator details stay under Cluster Settings.
    isActive: (pathname) =>
      /^\/c\/[^/]+\/settings\/cluster(?:\/|$)/.test(pathname) || kindMatcher('clusteroperators')(pathname),
    requires: ClusterVersionModel,
  },
  {
    section: 'home',
    order: 15,
    label: 'Search',
    path: (cluster) => searchPath(cluster),
    isActive: (pathname) => /^\/c\/[^/]+\/search(?:\/|$)/.test(pathname),
  },
];

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Active for `k8s/<plural>` and any list or details path of the kind: `k8s/(ns/<x>|all-namespaces|cluster)/<plural>…`. */
function kindMatcher(plural: string): (pathname: string) => boolean {
  const kind = escapeRegExp(encodeURIComponent(plural));
  const pattern = new RegExp(`^/c/[^/]+/k8s/(?:ns/[^/]+/|all-namespaces/|cluster/)?${kind}(?:/|$)`);
  return (pathname) => pattern.test(pathname);
}

/**
 * The cluster's sidebar sections, derived from the registry and discovery (ADR-0023 §5, UI-2/DATA-2): each
 * descriptor with `nav` becomes an item in its section (by `order`), kinds the cluster doesn't serve are hidden (e.g.
 * Projects on vanilla Kubernetes) and empty sections are dropped. Pages that aren't a kind's list (Overview, Search,
 * Cluster Settings) are {@link STATIC_NAV_ITEMS} slotted in by order, hidden like kinds when their `requires` model isn't
 * served. Namespaced kinds link to `k8s/<plural>` (the namespace redirect), cluster-scoped ones to
 * `k8s/cluster/<plural>`.
 */
export function useClusterNav(cluster: string): NavSection[] {
  const discovery = useK8sDiscovery(cluster);
  return buildClusterNav(cluster, (model) => discovery.isServed(model));
}

/**
 * Pure core of {@link useClusterNav}: the sidebar for `cluster` given which models it serves. Exported so the
 * distribution gating can be table-tested against recorded discovery documents without rendering (DSC-1/2).
 */
export function buildClusterNav(cluster: string, isServed: (model: K8sModel) => boolean): NavSection[] {
  const navigable = resourceDescriptors().filter(
    (descriptor) => descriptor.nav && isServed(descriptor.model),
  );
  return SECTIONS.map((section) => ({
    id: section.id,
    title: section.title,
    items: [
      ...navigable
        .filter((descriptor) => descriptor.nav?.section === section.id)
        .map(({ model, nav }) => ({
          order: nav?.order ?? 0,
          label: nav?.label ?? model.labelPlural,
          to: resourcePath(cluster, model),
          isActive: kindMatcher(model.plural),
        })),
      ...STATIC_NAV_ITEMS.filter(
        (item) => item.section === section.id && (!item.requires || isServed(item.requires)),
      ).map((item) => ({
        order: item.order,
        label: item.label,
        to: item.path(cluster),
        isActive: item.isActive,
      })),
    ]
      .sort((a, b) => a.order - b.order)
      .map(({ label, to, isActive }) => ({ label, to, isActive })),
  })).filter((section) => section.items.length > 0);
}
