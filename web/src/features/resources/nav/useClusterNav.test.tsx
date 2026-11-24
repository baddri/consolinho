import { screen, within } from '@testing-library/react';
import { mockDb } from '@/test/handlers';
import { renderApp } from '@/test/render';
import { descriptorForPlural } from '../registry/registry';

// WL-1: the Workloads section lists OCP's kinds in OCP's order (console-extensions.json); discovery hides
// DeploymentConfigs where apps.openshift.io is not served.

const WORKLOADS = [
  'Pods',
  'Deployments',
  'DeploymentConfigs',
  'StatefulSets',
  'Secrets',
  'ConfigMaps',
  'CronJobs',
  'Jobs',
  'DaemonSets',
  'ReplicaSets',
  'ReplicationControllers',
  'HorizontalPodAutoscalers',
];

/** Gives `admin` a grant on lab-1 (fixtures grant admin dev-1 and prod-k8s-1). */
function grantAdminOnLab1(): void {
  const [credential] = mockDb.credentials;
  const [grant] = mockDb.grants;
  if (!credential || !grant) throw new Error('fixtures lack a credential or grant');
  mockDb.credentials.push({
    ...structuredClone(credential),
    id: 'cred-lab-1',
    name: 'fleet-admin',
    clusterName: 'lab-1',
  });
  mockDb.grants.push({
    ...structuredClone(grant),
    id: 'grant-lab-1',
    subjectName: 'admin',
    clusterName: 'lab-1',
    credentialId: 'cred-lab-1',
  });
}

/** Link names of the sidebar's workload items, in sidebar order. */
async function workloadItems(user: ReturnType<typeof renderApp>['user']): Promise<string[]> {
  await user.click(await screen.findByRole('button', { name: 'Global navigation' }));
  const nav = await screen.findByRole('navigation', { name: 'Global' });
  return within(nav)
    .getAllByRole('link', { hidden: true })
    .map((link) => link.textContent)
    .filter((label) => WORKLOADS.includes(label));
}

describe('Workloads navigation (WL-1)', () => {
  it('lists the twelve workload kinds in OCP order on OpenShift', async () => {
    const { user } = renderApp('/c/dev-1/k8s/cluster/projects');

    await screen.findByRole('grid', { name: 'Projects' });
    expect(await workloadItems(user)).toEqual(WORKLOADS);
  });

  it.each(['lab-1', 'prod-k8s-1'])('hides DeploymentConfigs on vanilla %s', async (cluster) => {
    if (cluster === 'lab-1') grantAdminOnLab1();
    const { user } = renderApp(`/c/${cluster}/k8s/cluster/namespaces`);

    await screen.findByRole('grid', { name: 'Namespaces' });
    expect(await workloadItems(user)).toEqual(WORKLOADS.filter((label) => label !== 'DeploymentConfigs'));
  });
});

/** Section titles and item names of the sidebar, in sidebar order (`["Networking", "Services", …]`). */
async function sectionItems(
  user: ReturnType<typeof renderApp>['user'],
  sections: readonly string[],
): Promise<Record<string, string[]>> {
  await user.click(await screen.findByRole('button', { name: 'Global navigation' }));
  const nav = await screen.findByRole('navigation', { name: 'Global' });
  const result: Record<string, string[]> = {};
  for (const title of sections) {
    const toggle = within(nav).queryByRole('button', { name: title, hidden: true });
    const group = toggle?.closest('li');
    result[title] = group
      ? within(group)
          .getAllByRole('link', { hidden: true })
          .map((link) => link.textContent)
      : [];
  }
  return result;
}

const CLUSTER_SECTIONS = ['Home', 'Workloads', 'Networking', 'Storage', 'Administration'];

/** The registry-driven section toggles of the sidebar, in order (the cluster switcher and Favorites left out). */
async function sectionTitles(): Promise<string[]> {
  const nav = await screen.findByRole('navigation', { name: 'Global' });
  return within(nav)
    .getAllByRole('button', { hidden: true })
    .map((toggle) => toggle.textContent)
    .filter((title) => CLUSTER_SECTIONS.includes(title));
}

describe('Networking and Storage navigation (NAV-1/2)', () => {
  it('shows the Storage section and the networking kinds on OpenShift', async () => {
    const { user } = renderApp('/c/dev-1/k8s/cluster/projects');

    await screen.findByRole('grid', { name: 'Projects' });
    expect(await sectionItems(user, ['Networking', 'Storage'])).toEqual({
      Networking: ['Services', 'Routes', 'Ingresses', 'NetworkPolicies'],
      Storage: ['PersistentVolumes', 'PersistentVolumeClaims', 'StorageClasses'],
    });
    expect(await sectionTitles()).toEqual(CLUSTER_SECTIONS);
  });

  it('hides Routes on vanilla Kubernetes', async () => {
    const { user } = renderApp('/c/prod-k8s-1/k8s/cluster/namespaces');

    await screen.findByRole('grid', { name: 'Namespaces' });
    expect((await sectionItems(user, ['Networking'])).Networking).toEqual([
      'Services',
      'Ingresses',
      'NetworkPolicies',
    ]);
  });

  it.each([
    ['routes', 'Routes', 'k8s/ns/shop', 'web-canary', 'Route'],
    ['ingresses', 'Ingresses', 'k8s/ns/shop', 'shop-ingress', 'Ingress'],
    ['networkpolicies', 'NetworkPolicies', 'k8s/ns/shop', 'deny-all-ingress', 'NetworkPolicy'],
    ['persistentvolumeclaims', 'PersistentVolumeClaims', 'k8s/ns/shop', 'db-data', 'PersistentVolumeClaim'],
    ['persistentvolumes', 'PersistentVolumes', 'k8s/cluster', 'pv-db-data', 'PersistentVolume'],
    ['storageclasses', 'StorageClasses', 'k8s/cluster', 'standard-csi', 'StorageClass'],
  ])('lists the mock %s and opens one', async (plural, title, scope, name, label) => {
    const { user } = renderApp(`/c/dev-1/${scope}/${plural}`);

    const table = await screen.findByRole('grid', { name: title });
    await user.click(await within(table).findByRole('link', { name }));
    expect(await screen.findByRole('heading', { name: `${label} details`, level: 2 })).toBeInTheDocument();
  });
});

describe('ListActions (list heading buttons)', () => {
  it('renders the descriptor\'s ListActions in the list heading', async () => {
    const descriptor = descriptorForPlural('storageclasses');
    if (!descriptor) throw new Error('storageclasses not registered');
    descriptor.ListActions = ({ cluster }) => <button type="button">Create on {cluster}</button>;
    onTestFinished(() => {
      delete descriptor.ListActions;
    });
    renderApp('/c/dev-1/k8s/cluster/storageclasses');

    await screen.findByRole('grid', { name: 'StorageClasses' });
    expect(screen.getByRole('button', { name: 'Create on dev-1' })).toBeInTheDocument();
  });
});
