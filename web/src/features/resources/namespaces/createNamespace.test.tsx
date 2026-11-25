import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { NamespaceModel, setWatchTimingForTests, type K8sResource } from '@/shared/k8s';
import { COLD_START_TEST_TIMEOUT_MS, COLD_START_TIMEOUT_MS, preloadLazyRoutes } from '@/test/coldStart';
import { mockK8s, setMockUser } from '@/test/handlers';
import { renderApp, renderWithProviders } from '@/test/render';
import { server } from '@/test/server';
import { resourceRoutes } from '../routes';
import { CreateNamespaceButton } from './CreateNamespaceButton';
import { NAMESPACE_NAME_HELP } from './createNamespaceSchema';

const PROXY = '*/api/clusters/:cluster/k8s/*';
const NAMESPACES = '/c/prod-k8s-1/k8s/cluster/namespaces';

beforeAll(() => preloadLazyRoutes(resourceRoutes));
beforeEach(() => {
  onTestFinished(
    setWatchTimingForTests({ flushMs: 10, initialBackoffMs: 20, maxBackoffMs: 40, minStreamMs: 100 }),
  );
});

/**
 * The MSW `prod-k8s-1` credential is `edit`, which may not create namespaces: answer the access review as allowed
 * and, with `allowCreate`, let the POST through as an admin ServiceAccount would (409 for a taken name).
 */
function allowNamespaceCreate({ allowCreate }: { allowCreate: boolean }) {
  server.use(
    http.post(PROXY, async ({ request }) => {
      const path = new URL(request.url).pathname;
      if (path.endsWith('/selfsubjectaccessreviews')) {
        const review = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ...review, status: { allowed: true } }, { status: 201 });
      }
      if (!allowCreate || !path.endsWith('/api/v1/namespaces')) return undefined;
      const body = (await request.json()) as K8sResource;
      const name = body.metadata.name ?? '';
      if (mockK8s.get('prod-k8s-1', NamespaceModel, undefined, name)) {
        return HttpResponse.json(
          {
            kind: 'Status',
            apiVersion: 'v1',
            status: 'Failure',
            reason: 'AlreadyExists',
            code: 409,
            message: `namespaces "${name}" already exists`,
          },
          { status: 409 },
        );
      }
      return HttpResponse.json(mockK8s.upsert('prod-k8s-1', body), { status: 201 });
    }),
  );
}

/** Opens the Create Namespace modal from the prod-k8s-1 Namespaces list once the button is enabled. */
async function openModal() {
  const rendered = renderApp(NAMESPACES);
  const button = await screen.findByRole(
    'button',
    { name: 'Create Namespace' },
    { timeout: COLD_START_TIMEOUT_MS },
  );
  await waitFor(() => expect(button).not.toHaveAttribute('aria-disabled', 'true'));
  await rendered.user.click(button);
  const dialog = await screen.findByRole('dialog', { name: 'Create Namespace' });
  return { ...rendered, dialog };
}

describe('Create Namespace (T-0385, NSC-1)', () => {
  it(
    'creates team-k8s with labels, lands on its details and toasts namespace and cluster',
    async () => {
      allowNamespaceCreate({ allowCreate: true });
      const { user, dialog, router } = await openModal();
      const name = within(dialog).getByRole('textbox', { name: 'Name' });
      await waitFor(() => expect(name).toHaveFocus());
      expect(dialog).not.toHaveTextContent(NAMESPACE_NAME_HELP);
      await user.type(name, 'team-k8s');
      const labels = within(dialog).getByRole('textbox', { name: 'Labels' });
      expect(labels).toHaveAttribute('placeholder', 'app=frontend');
      await user.type(labels, 'app=frontend ');
      expect(within(dialog).getByText('app=frontend')).toBeInTheDocument();
      // Valid text still typed is included on Create.
      await user.type(labels, 'tier=web');
      await waitFor(() =>
        expect(dialog).toHaveTextContent('Namespace team-k8s on Production Kubernetes Frankfurt 1'),
      );
      await user.click(within(dialog).getByRole('button', { name: 'Create' }));

      await waitFor(() => expect(router.state.location.pathname).toBe(`${NAMESPACES}/team-k8s`));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(
        await screen.findByText('Namespace team-k8s created on Production Kubernetes Frankfurt 1'),
      ).toBeInTheDocument();
      expect(mockK8s.get('prod-k8s-1', NamespaceModel, undefined, 'team-k8s')?.metadata.labels).toEqual({
        app: 'frontend',
        tier: 'web',
      });
    },
    COLD_START_TEST_TIMEOUT_MS,
  );

  it(
    "the Name label Help popover shows OCP's rule",
    async () => {
      allowNamespaceCreate({ allowCreate: false });
      const { user, dialog } = await openModal();
      await user.click(within(dialog).getByRole('button', { name: 'Help' }));
      expect(await screen.findByRole('dialog', { name: 'Help' })).toHaveTextContent(NAMESPACE_NAME_HELP);
    },
    COLD_START_TEST_TIMEOUT_MS,
  );

  it(
    'a taken name (409) shows the server message inline and keeps the modal open',
    async () => {
      allowNamespaceCreate({ allowCreate: true });
      const { user, dialog } = await openModal();
      await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'default');
      await user.click(within(dialog).getByRole('button', { name: 'Create' }));

      expect(await within(dialog).findByText('An error occurred')).toBeInTheDocument();
      expect(within(dialog).getByText('namespaces "default" already exists')).toBeInTheDocument();
      expect(screen.getByRole('dialog', { name: 'Create Namespace' })).toBeInTheDocument();
    },
    COLD_START_TEST_TIMEOUT_MS,
  );

  it(
    'a cluster denial on POST (403) shows inline',
    async () => {
      allowNamespaceCreate({ allowCreate: false });
      const { user, dialog } = await openModal();
      await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'team-k8s');
      await user.click(within(dialog).getByRole('button', { name: 'Create' }));

      expect(await within(dialog).findByText('An error occurred')).toBeInTheDocument();
      expect(dialog).toHaveTextContent('forbidden');
      expect(mockK8s.get('prod-k8s-1', NamespaceModel, undefined, 'team-k8s')).toBeUndefined();
    },
    COLD_START_TEST_TIMEOUT_MS,
  );

  it(
    'an invalid name blocks Create with a field error; an invalid label disables Create',
    async () => {
      allowNamespaceCreate({ allowCreate: true });
      const { user, dialog } = await openModal();
      await user.click(within(dialog).getByRole('button', { name: 'Create' }));
      expect(await within(dialog).findByText('Name is required.')).toBeInTheDocument();
      await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'Bad_Name');
      await user.click(within(dialog).getByRole('button', { name: 'Create' }));
      expect(
        await within(dialog).findByText(
          "Use lowercase letters, digits and '-' (max 63), starting and ending with a letter or digit.",
        ),
      ).toBeInTheDocument();

      await user.type(within(dialog).getByRole('textbox', { name: 'Labels' }), '-bad');
      expect(within(dialog).getByRole('button', { name: 'Create' })).toBeDisabled();
      expect(mockK8s.get('prod-k8s-1', NamespaceModel, undefined, 'Bad_Name')).toBeUndefined();
    },
    COLD_START_TEST_TIMEOUT_MS,
  );

  it(
    'is not offered where Projects are served (OpenShift)',
    async () => {
      renderApp('/c/dev-1/k8s/cluster/namespaces');
      await screen.findByRole('link', { name: 'shop' }, { timeout: COLD_START_TIMEOUT_MS });
      expect(screen.queryByRole('button', { name: 'Create Namespace' })).not.toBeInTheDocument();
    },
    COLD_START_TEST_TIMEOUT_MS,
  );
});

describe('Create Namespace access (NSC-2, as Create Project)', () => {
  it('a read-only grant keeps the button visible, disabled with the reason', async () => {
    setMockUser('alice');
    const { user } = renderWithProviders(<CreateNamespaceButton cluster="prod-k8s-1" />);

    await waitFor(async () => {
      await user.hover(screen.getByRole('button', { name: 'Create Namespace' }));
      expect(screen.getByRole('tooltip')).toHaveTextContent('Your access to prod-k8s-1 is read-only.');
    });
    const button = screen.getByRole('button', { name: 'Create Namespace' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    await user.click(button);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('an edit ServiceAccount (SSAR denial) disables it with the RBAC reason', async () => {
    const { user } = renderWithProviders(<CreateNamespaceButton cluster="prod-k8s-1" />);

    await waitFor(async () => {
      await user.hover(screen.getByRole('button', { name: 'Create Namespace' }));
      expect(screen.getByRole('tooltip')).toHaveTextContent(
        'The service account for prod-k8s-1 cannot create namespaces (cluster RBAC).',
      );
    });
    expect(screen.getByRole('button', { name: 'Create Namespace' })).toHaveAttribute('aria-disabled', 'true');
  });
});
