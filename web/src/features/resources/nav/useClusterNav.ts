import { useK8sDiscovery } from '@/shared/k8s';
import { resourcePath } from '../paths';
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

/** Section order and titles of the cluster navigation (spec UI-2). */
const SECTIONS: readonly { id: NavSectionId; title: string }[] = [
  { id: 'home', title: 'Home' },
  { id: 'workloads', title: 'Workloads' },
  { id: 'networking', title: 'Networking' },
  { id: 'administration', title: 'Administration' },
];

/** A sidebar item that isn't a kind's list, placed among the registry items of its section by `order`. */
interface StaticNavItem {
  section: NavSectionId;
  order: number;
  label: string;
  path: (cluster: string) => string;
  isActive: (pathname: string) => boolean;
}

/** OCP Home: Overview, Projects, Search, API Explorer, Events — Search sits between Projects (10) and Events (20). */
const STATIC_ITEMS: readonly StaticNavItem[] = [
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
 * Projects on vanilla Kubernetes) and empty sections are dropped. Pages that aren't a kind's list (Search) are
 * {@link STATIC_ITEMS} slotted in by order. Namespaced kinds link to `k8s/<plural>` (the
 * namespace redirect), cluster-scoped ones to `k8s/cluster/<plural>`.
 */
export function useClusterNav(cluster: string): NavSection[] {
  const discovery = useK8sDiscovery(cluster);
  const navigable = resourceDescriptors().filter(
    (descriptor) => descriptor.nav && discovery.isServed(descriptor.model),
  );
  return SECTIONS.map((section) => ({
    id: section.id,
    title: section.title,
    items: [
      ...navigable
        .filter((descriptor) => descriptor.nav?.section === section.id)
        .map(({ model, nav }) => ({
          order: nav?.order ?? 0,
          label: model.labelPlural,
          to: resourcePath(cluster, model),
          isActive: kindMatcher(model.plural),
        })),
      ...STATIC_ITEMS.filter((item) => item.section === section.id).map((item) => ({
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
