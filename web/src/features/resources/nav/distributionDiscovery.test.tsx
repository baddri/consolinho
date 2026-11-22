import { screen, waitFor, within } from '@testing-library/react';
import { COLD_START_TEST_TIMEOUT_MS, COLD_START_TIMEOUT_MS, preloadLazyRoutes } from '@/test/coldStart';
import { mockDb } from '@/test/handlers';
import { renderApp } from '@/test/render';
import { resourceRoutes } from '../routes';

// DIST-5: the declared distribution is presentation only; nav and landing follow discovery (ADR-0032).

beforeAll(() => preloadLazyRoutes(resourceRoutes));

/** Gives `admin` a grant on `clusterName` (fixtures grant only dev-1) and enables the cluster. */
function grantAdminOn(clusterName: string): void {
  const cluster = mockDb.clusters.find((c) => c.name === clusterName);
  if (!cluster) throw new Error(`no cluster ${clusterName}`);
  const [credential] = mockDb.credentials;
  const [grant] = mockDb.grants;
  if (!credential || !grant) throw new Error('fixtures lack a credential or grant');
  cluster.isEnabled = true;
  mockDb.credentials.push({
    ...structuredClone(credential),
    id: `cred-${clusterName}`,
    name: 'fleet-admin',
    clusterName,
  });
  mockDb.grants.push({
    ...structuredClone(grant),
    id: `grant-${clusterName}`,
    username: 'admin',
    clusterName,
    credentialId: `cred-${clusterName}`,
  });
}

/** Item names of the cluster sidebar. */
async function navItems(user: ReturnType<typeof renderApp>['user']): Promise<string[]> {
  await user.click(await screen.findByRole('button', { name: 'Global navigation' }));
  const nav = await screen.findByRole('navigation', { name: 'Global' });
  return within(nav)
    .getAllByRole('link', { hidden: true })
    .map((link) => link.textContent);
}

describe('discovery wins over the declared distribution (DIST-5)', () => {
  it(
    'offers Projects and lands on them for a cluster declared Kubernetes that serves project.openshift.io',
    { timeout: COLD_START_TEST_TIMEOUT_MS },
    async () => {
      grantAdminOn('dev-2');
      expect(mockDb.clusters.find((c) => c.name === 'dev-2')?.distribution).toBe('kubernetes');
      const { user, router } = renderApp('/c/dev-2');

      await waitFor(() => expect(router.state.location.pathname).toBe('/c/dev-2/k8s/cluster/projects'), {
        timeout: COLD_START_TIMEOUT_MS,
      });
      expect(await navItems(user)).toContain('Projects');
    },
  );

  it('offers only Namespaces for a cluster declared OpenShift without project.openshift.io', async () => {
    grantAdminOn('lab-1');
    const lab1 = mockDb.clusters.find((c) => c.name === 'lab-1');
    if (lab1) lab1.distribution = 'openShift';
    const { user, router } = renderApp('/c/lab-1');

    await waitFor(() => expect(router.state.location.pathname).toBe('/c/lab-1/k8s/cluster/namespaces'));
    const items = await navItems(user);
    expect(items).toContain('Namespaces');
    expect(items).not.toContain('Projects');
  });
});
