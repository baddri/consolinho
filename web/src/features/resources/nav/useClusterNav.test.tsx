import { screen, within } from '@testing-library/react';
import { mockDb } from '@/test/handlers';
import { renderApp } from '@/test/render';

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
    username: 'admin',
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
