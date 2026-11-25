import type { K8sModel } from '@/shared/k8s';
import { kindApiGroups, kindApiVersions } from '@/test/kindDiscovery';
import { resourceDescriptors } from '../registry/registry';
import { buildClusterNav, STATIC_NAV_ITEMS } from './useClusterNav';

// DSC-1/DSC-2: the sidebar of a vanilla Kubernetes cluster, built from the discovery documents recorded on kind
// (T-0377). Gating mirrors `useK8sDiscovery`: a model is served when its group serves `model.version`.

const coreVersions: readonly string[] = kindApiVersions.versions;
const groupVersions = new Map(
  kindApiGroups.groups.map((group) => [group.name, group.versions.map((v) => v.version)]),
);

/** Whether the kind cluster serves `model` (core = group `''`). */
function isServed(model: K8sModel): boolean {
  const versions = model.group ? groupVersions.get(model.group) : coreVersions;
  return versions?.includes(model.version) ?? false;
}

/** Whether the kind discovery lists `group` at all (core always). */
const hasGroup = (group: string | undefined) => !group || groupVersions.has(group);

/** Groups every conformant Kubernetes cluster serves: their nav kinds must always show. */
const VANILLA_GROUPS = new Set(['', 'apps', 'batch', 'networking.k8s.io', 'storage.k8s.io']);

/** Static items fine on any distribution. Any other static item must declare `requires`. */
const UNGATED_ALLOWLIST = new Set(['Overview', 'Search']);

const nav = buildClusterNav('kind', isServed);
const shownLabels = new Set(nav.flatMap((section) => section.items.map((item) => item.label)));

const navDescriptors = resourceDescriptors()
  .filter((descriptor) => descriptor.nav)
  .map((descriptor) => ({
    name: `${descriptor.model.group || 'core'}/${descriptor.model.kind}`,
    group: descriptor.model.group,
    label: descriptor.nav?.label ?? descriptor.model.labelPlural,
  }));

describe('kind discovery gating (DSC-2)', () => {
  it.each(navDescriptors)('$name is shown exactly when its group is served', ({ group, label }) => {
    expect(shownLabels.has(label)).toBe(hasGroup(group));
    if (VANILLA_GROUPS.has(group)) expect(shownLabels.has(label)).toBe(true);
  });

  it.each(STATIC_NAV_ITEMS.map((item) => ({ ...item, name: item.label })))(
    'static item $name is gated by its required group',
    (item) => {
      if (!item.requires) {
        expect(
          UNGATED_ALLOWLIST.has(item.label),
          `static nav item "${item.label}" has no \`requires\`: gate it on the model it needs, or add it to the distribution-neutral allowlist`,
        ).toBe(true);
      }
      expect(shownLabels.has(item.label)).toBe(hasGroup(item.requires?.group));
    },
  );
});

describe('kind sidebar (DSC-1)', () => {
  it('has exactly the OCP-shaped sections and items a vanilla cluster serves', () => {
    expect(nav.map((section) => [section.title, section.items.map((item) => item.label)])).toEqual([
      ['Home', ['Overview', 'Search', 'Events']],
      [
        'Workloads',
        [
          'Pods',
          'Deployments',
          'StatefulSets',
          'Secrets',
          'ConfigMaps',
          'CronJobs',
          'Jobs',
          'DaemonSets',
          'ReplicaSets',
          'ReplicationControllers',
          'HorizontalPodAutoscalers',
        ],
      ],
      ['Networking', ['Services', 'Ingresses', 'NetworkPolicies']],
      ['Storage', ['PersistentVolumes', 'PersistentVolumeClaims', 'StorageClasses']],
      ['Compute', ['Nodes']],
      ['Administration', ['Namespaces']],
    ]);
  });
});
