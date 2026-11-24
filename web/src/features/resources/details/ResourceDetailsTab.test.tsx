import { screen, waitFor, within } from '@testing-library/react';
import { COLD_START_TEST_TIMEOUT_MS, COLD_START_TIMEOUT_MS, preloadLazyRoutes } from '@/test/coldStart';
import { setMockUser } from '@/test/handlers';
import { renderApp } from '@/test/render';
import { server } from '@/test/server';
import { resourceRoutes } from '../routes';

beforeAll(() => preloadLazyRoutes(resourceRoutes));

const POD_PATH = '/c/dev-1/k8s/ns/shop/pods/web-7d4b9c8f6d-2xkqp';

/** The breadcrumb items of the open field-help popover's footer, e.g. `['Pod', 'spec', 'restartPolicy']`. */
function popoverPath(popover: HTMLElement): string[] {
  const crumbs = within(popover).getByRole('navigation', { name: 'Breadcrumb' });
  return within(crumbs)
    .getAllByRole('listitem')
    .map((item) => item.textContent);
}

describe('details field help (HELP-1, OCP DetailsItem path)', () => {
  it(
    'opens a Pod term popover with the label, the cluster description and the path',
    { timeout: COLD_START_TEST_TIMEOUT_MS },
    async () => {
      const { user } = renderApp(POD_PATH);

      const term = await screen.findByRole(
        'button',
        { name: 'Restart policy' },
        { timeout: COLD_START_TIMEOUT_MS },
      );
      await user.click(term);

      const popover = await screen.findByRole('dialog');
      expect(within(popover).getByRole('heading', { name: 'Restart policy' })).toBeInTheDocument();
      expect(within(popover).getByRole('region', { name: 'Restart policy' })).toHaveTextContent(
        /^Restart policy for all containers within the pod/,
      );
      expect(popoverPath(popover)).toEqual(['Pod', 'spec', 'restartPolicy']);
      // MetadataSection passes OCP's paths too.
      expect(screen.getByRole('button', { name: 'Labels' })).toBeInTheDocument();
    },
  );

  it('describes a nested Deployment field and keeps terms without a path or description plain', async () => {
    const { user } = renderApp('/c/dev-1/k8s/ns/shop/deployments/web');

    await user.click(await screen.findByRole('button', { name: 'Max surge' }));

    const popover = await screen.findByRole('dialog');
    expect(within(popover).getByRole('region', { name: 'Max surge' })).toHaveTextContent(
      /^The maximum number of pods that can be scheduled above the desired number of pods/,
    );
    expect(popoverPath(popover)).toEqual(['Deployment', 'spec', 'strategy', 'rollingUpdate', 'maxSurge']);
    // "Status" has no path (OCP), so it is a plain term.
    expect(screen.queryByRole('button', { name: 'Status' })).not.toBeInTheDocument();
    expect(screen.getByText('Status', { selector: 'dt *' })).toBeInTheDocument();
  });

  it('alice on prod-eu-1 (OpenAPI 403): plain terms and no error', async () => {
    const forbidden = new Promise<void>((resolve) => {
      server.events.on('response:mocked', ({ request, response }) => {
        if (new URL(request.url).pathname.endsWith('/openapi/v3') && response.status === 403) resolve();
      });
    });
    setMockUser('alice');
    renderApp('/c/prod-eu-1/k8s/ns/shop/pods/web-7d4b9c8f6d-2xkqp');

    expect(await screen.findByText('Restart policy')).toBeInTheDocument();
    await forbidden;
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Restart policy' })).not.toBeInTheDocument(),
    );
    expect(screen.queryByRole('button', { name: 'Labels' })).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('details metadata inline edit (OCP ResourceSummary canUpdate)', () => {
  it('admin: Labels "Edit" and the annotation count open the Actions menu modals', async () => {
    const { user } = renderApp(POD_PATH);

    const metadata = await screen.findByLabelText('Metadata', {}, { timeout: COLD_START_TIMEOUT_MS });
    await user.click(await within(metadata).findByRole('button', { name: 'Edit' }));
    expect(await screen.findByRole('dialog', { name: 'Edit labels' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await user.click(within(metadata).getByRole('button', { name: /^\d+ annotations?$/ }));
    expect(await screen.findByRole('dialog', { name: 'Edit annotations' })).toBeInTheDocument();
  });

  it('alice on a read-only grant: no Edit and a plain annotation count', async () => {
    setMockUser('alice');
    renderApp('/c/prod-eu-1/k8s/ns/shop/pods/web-7d4b9c8f6d-2xkqp');

    const metadata = await screen.findByLabelText('Metadata', {}, { timeout: COLD_START_TIMEOUT_MS });
    expect(await within(metadata).findByText(/^\d+ annotations?$/)).toBeInTheDocument();
    expect(within(metadata).queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(within(metadata).queryByRole('button', { name: /annotation/ })).not.toBeInTheDocument();
  });
});
