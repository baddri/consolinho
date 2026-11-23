import { screen, within } from '@testing-library/react';
import type { K8sResource } from '@/shared/k8s';
import { COLD_START_TEST_TIMEOUT_MS, COLD_START_TIMEOUT_MS, preloadLazyRoutes } from '@/test/coldStart';
import { renderApp, renderWithProviders } from '@/test/render';
import { stubLogViewerLayout } from '@/test/logViewer';
import { ResourceActionsMenu } from '../../actions/ResourceActionsMenu';
import { ResourceRowActions } from '../../actions/ResourceRowActions';
import { resourceRoutes } from '../../routes';
import { podDescriptor } from './pods';

const CRASHING_POD = 'web-7d4b9c8f6d-tq5wn';
const pod: K8sResource = { apiVersion: 'v1', kind: 'Pod', metadata: { name: CRASHING_POD, namespace: 'shop' } };
/** OCP `usePodActionsProvider`: the common actions only, no Pod-specific items. */
const POD_ACTIONS = ['Edit labels', 'Edit annotations', 'Edit Pod', 'Delete Pod'];

beforeAll(() => preloadLazyRoutes(resourceRoutes));
beforeEach(() => stubLogViewerLayout()); // DEP-2 "View logs" mounts the Logs tab (PF LogViewer)

describe('pod descriptor', () => {
  it('DEP-1: the row kebab lists the common actions in OCP order', async () => {
    const { user } = renderWithProviders(
      <table>
        <tbody>
          <tr>
            <ResourceRowActions cluster="dev-1" descriptor={podDescriptor} obj={pod} />
          </tr>
        </tbody>
      </table>,
    );

    await user.click(screen.getByRole('button', { name: 'Kebab toggle' }));
    const items = (await screen.findAllByRole('menuitem')).map((item) => item.textContent);
    expect(items).toEqual(POD_ACTIONS);
  });

  it('DEP-1: and the details Actions menu', async () => {
    const { user } = renderWithProviders(
      <ResourceActionsMenu cluster="dev-1" descriptor={podDescriptor} obj={pod} />,
    );

    await user.click(screen.getByRole('button', { name: 'Actions' }));
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(POD_ACTIONS);
  });

  it('DEP-2: a CrashLoopBackOff row opens the status popover; "View logs" opens Logs on that container', { timeout: COLD_START_TEST_TIMEOUT_MS }, async () => {
    const { user, router } = renderApp('/c/dev-1/k8s/ns/shop/pods');

    const row = await screen.findByRole(
      'row',
      { name: new RegExp(CRASHING_POD) },
      { timeout: COLD_START_TIMEOUT_MS },
    );
    await user.click(within(row).getByRole('button', { name: /CrashLoopBackOff/ }));
    const popover = await screen.findByRole('dialog');
    expect(within(popover).getByText('Pod crash loop backoff')).toBeInTheDocument();
    expect(within(popover).getByText(/restarting failed container=web/)).toBeInTheDocument();

    await user.click(within(popover).getByRole('link', { name: 'View logs' }));
    expect(await screen.findByRole('tabpanel', { name: 'Logs' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(`/c/dev-1/k8s/ns/shop/pods/${CRASHING_POD}/logs`);
    expect(router.state.location.search).toBe('?container=web');
  });
});
