import { ADMIN_SECTIONS } from '@/features/admin';

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

const enc = encodeURIComponent;

/** Matches `/c/<any>/<rest>` where rest equals `suffix` or continues below it. */
function clusterPageMatcher(suffix: string) {
  const pattern = new RegExp(`^/c/[^/]+/${suffix}(?:/|$)`);
  return (pathname: string) => pattern.test(pathname);
}

/** Namespaced kind: list in all namespaces; active for any namespace and for its details pages. */
function namespaced(cluster: string, label: string, resource: string): NavLinkItem {
  return {
    label,
    to: `/c/${enc(cluster)}/ns/all/${resource}`,
    isActive: clusterPageMatcher(`ns/[^/]+/${resource}`),
  };
}

/** Cluster-scoped kind (nodes, PVs, namespaces ...). */
function clusterScoped(cluster: string, label: string, resource: string): NavLinkItem {
  return {
    label,
    to: `/c/${enc(cluster)}/cluster/${resource}`,
    isActive: clusterPageMatcher(`cluster/${resource}`),
  };
}

/** Plain cluster page such as overview or search. */
function clusterPage(cluster: string, label: string, page: string): NavLinkItem {
  return { label, to: `/c/${enc(cluster)}/${page}`, isActive: clusterPageMatcher(page) };
}

/**
 * OpenShift-console-like navigation for one cluster. Resource segments use the Kubernetes plural resource name,
 * which is what the resource registry will key on.
 */
export function buildClusterNav(cluster: string): NavSection[] {
  return [
    {
      id: 'home',
      title: 'Home',
      items: [
        clusterPage(cluster, 'Overview', 'overview'),
        clusterPage(cluster, 'Search', 'search'),
        namespaced(cluster, 'Events', 'events'),
      ],
    },
    {
      id: 'workloads',
      title: 'Workloads',
      items: [
        namespaced(cluster, 'Pods', 'pods'),
        namespaced(cluster, 'Deployments', 'deployments'),
        namespaced(cluster, 'StatefulSets', 'statefulsets'),
        namespaced(cluster, 'DaemonSets', 'daemonsets'),
        namespaced(cluster, 'Jobs', 'jobs'),
        namespaced(cluster, 'CronJobs', 'cronjobs'),
        namespaced(cluster, 'ConfigMaps', 'configmaps'),
        namespaced(cluster, 'Secrets', 'secrets'),
      ],
    },
    {
      id: 'networking',
      title: 'Networking',
      items: [
        namespaced(cluster, 'Services', 'services'),
        namespaced(cluster, 'Routes', 'routes'),
        namespaced(cluster, 'Ingresses', 'ingresses'),
        namespaced(cluster, 'NetworkPolicies', 'networkpolicies'),
      ],
    },
    {
      id: 'storage',
      title: 'Storage',
      items: [
        namespaced(cluster, 'PersistentVolumeClaims', 'persistentvolumeclaims'),
        clusterScoped(cluster, 'PersistentVolumes', 'persistentvolumes'),
        clusterScoped(cluster, 'StorageClasses', 'storageclasses'),
      ],
    },
    { id: 'compute', title: 'Compute', items: [clusterScoped(cluster, 'Nodes', 'nodes')] },
    {
      id: 'administration',
      title: 'Administration',
      items: [clusterScoped(cluster, 'Namespaces', 'namespaces')],
    },
  ];
}

/** FleetConsole's own admin area (users, clusters, credentials, audit) — not tied to a cluster. */
export function buildAdminNav(): NavSection {
  return {
    id: 'admin',
    title: 'Fleet administration',
    items: ADMIN_SECTIONS.map((section) => ({
      label: section.title,
      to: `/admin/${section.id}`,
      isActive: (pathname: string) =>
        pathname === `/admin/${section.id}` || pathname.startsWith(`/admin/${section.id}/`),
    })),
  };
}
