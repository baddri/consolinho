import { screen, waitFor, within } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { PodModel, ProjectModel, setWatchTimingForTests, type K8sModel } from '@/shared/k8s';
import { COLD_START_TEST_TIMEOUT_MS, COLD_START_TIMEOUT_MS, preloadLazyRoutes } from '@/test/coldStart';
import { mockK8s, problem, setMockUser } from '@/test/handlers';
import { renderApp, renderWithProviders } from '@/test/render';
import { server } from '@/test/server';
import { deploymentDescriptor } from '../registry/kinds/deployments';
import { podDescriptor } from '../registry/kinds/pods';
import { projectDescriptor } from '../registry/kinds/projects';
import { resourceRoutes } from '../routes';
import { DeleteResourceModal } from './DeleteResourceModal';
import { useResourceAccess } from './useResourceAccess';
import { useResourceActions } from './useResourceActions';

const PROXY = '*/api/clusters/:cluster/k8s/*';
const SSAR_PATH = '/apis/authorization.k8s.io/v1/selfsubjectaccessreviews';
const POD = 'web-7d4b9c8f6d-2xkqp';
const POD_LIST = '/c/dev-1/k8s/ns/shop/pods';

beforeAll(() => preloadLazyRoutes(resourceRoutes));

beforeEach(() => {
  onTestFinished(
    setWatchTimingForTests({ flushMs: 10, initialBackoffMs: 20, maxBackoffMs: 40, minStreamMs: 100 }),
  );
});

/** Records the namespace/name of every SelfSubjectAccessReview POST. */
function recordAccessReviews(): string[] {
  const reviews: string[] = [];
  server.events.on('request:start', ({ request }) => {
    if (request.method === 'POST' && new URL(request.url).pathname.endsWith(SSAR_PATH)) {
      reviews.push(request.url);
    }
  });
  return reviews;
}

/** Shows what {@link useResourceAccess} answers, for the reason-order tests. */
function AccessProbe({
  cluster,
  model,
  namespace,
}: {
  cluster: string;
  model: K8sModel;
  namespace?: string;
}) {
  const { isChecking, disabledReason } = useResourceAccess(cluster, { verb: 'delete', model, namespace });
  return <p>{isChecking ? 'checking' : (disabledReason ?? 'allowed')}</p>;
}

/** Lists the item keys {@link useResourceActions} returns for a pod. */
function ActionKeysProbe() {
  const { items } = useResourceActions({
    cluster: 'dev-1',
    descriptor: podDescriptor,
    obj: { apiVersion: 'v1', kind: 'Pod', metadata: { name: POD, namespace: 'shop' } },
    reviewByName: false,
  });
  return <p>{items.map((item) => item.itemKey).join(',')}</p>;
}

/** The row of `name` in the pods table. */
async function findRow(name: string): Promise<HTMLElement> {
  const link = await screen.findByRole('link', { name }, { timeout: COLD_START_TIMEOUT_MS });
  const row = link.closest('tr');
  if (!row) throw new Error(`no row for ${name}`);
  return row;
}

async function openKebab(user: UserEvent, name: string): Promise<HTMLElement> {
  await user.click(within(await findRow(name)).getByRole('button', { name: 'Kebab toggle' }));
  return screen.findByRole('menuitem', { name: 'Delete Pod' });
}

/**
 * Makes the cluster delete the pod at once — its watch DELETED event unmounts the dialog — and answer the DELETE only
 * after `ms`, with `status` (200 Success, or 404 NotFound as if another client was faster).
 */
function deleteBeforeResponding(status: 200 | 404, ms = 300): void {
  server.use(
    http.delete(PROXY, async () => {
      mockK8s.remove('dev-1', PodModel, 'shop', POD);
      await delay(ms);
      return status === 200
        ? HttpResponse.json({ kind: 'Status', apiVersion: 'v1', status: 'Success', code: 200 })
        : HttpResponse.json(
            {
              kind: 'Status',
              apiVersion: 'v1',
              status: 'Failure',
              reason: 'NotFound',
              code: 404,
              message: 'gone',
            },
            { status: 404 },
          );
    }),
  );
}

describe('useResourceAccess (UI-9, QG-3)', () => {
  it.each([
    ['ines', 'prod-us-1', PodModel, 'shop', 'Your account is read-only.'],
    ['alice', 'prod-eu-1', PodModel, 'shop', 'Your access to prod-eu-1 is read-only.'],
  ])('%s on %s: "%s" without an access review', async (persona, cluster, model, namespace, reason) => {
    setMockUser(persona);
    const reviews = recordAccessReviews();
    renderWithProviders(<AccessProbe cluster={cluster} model={model} namespace={namespace} />);

    expect(await screen.findByText(reason)).toBeInTheDocument();
    expect(reviews).toEqual([]);
  });

  it('carol on prod-eu-1 may not delete projects: the RBAC sentence, without "in <ns>"', async () => {
    setMockUser('carol');
    const reviews = recordAccessReviews();
    renderWithProviders(<AccessProbe cluster="prod-eu-1" model={ProjectModel} />);

    expect(
      await screen.findByText('The service account for prod-eu-1 cannot delete projects (cluster RBAC).'),
    ).toBeInTheDocument();
    expect(reviews).toHaveLength(1);
  });

  it('carol on prod-eu-1 may delete pods', async () => {
    setMockUser('carol');
    renderWithProviders(<AccessProbe cluster="prod-eu-1" model={PodModel} namespace="shop" />);

    expect(await screen.findByText('allowed')).toBeInTheDocument();
  });
});

describe('resource actions (UI-8)', () => {
  it(
    'alice: the row Delete is aria-disabled with the read-only-grant tooltip',
    { timeout: COLD_START_TEST_TIMEOUT_MS },
    async () => {
      setMockUser('alice');
      const { user } = renderApp('/c/prod-eu-1/k8s/ns/shop/pods');

      const del = await openKebab(user, POD);
      await waitFor(() => expect(del).toHaveAttribute('aria-disabled', 'true'));
      await user.hover(del);
      expect(await screen.findByRole('tooltip')).toHaveTextContent('Your access to prod-eu-1 is read-only.');
      await user.click(del);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    },
  );

  it('while the access review is pending, Delete is disabled without a tooltip', async () => {
    server.use(
      http.post(PROXY, async ({ request }) => {
        if (new URL(request.url).pathname.endsWith(SSAR_PATH)) await delay('infinite');
        return undefined;
      }),
    );
    const { user } = renderApp(POD_LIST);

    const del = await openKebab(user, POD);
    expect(del).toHaveAttribute('aria-disabled', 'true');
    await user.hover(del);
    // Give a tooltip time to appear: none must.
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('rows of one namespace share a single access review', async () => {
    const reviews = recordAccessReviews();
    renderApp(POD_LIST);

    await findRow(POD);
    await waitFor(() => expect(reviews).toHaveLength(1));
    // The rows' checks are namespace-level: no name in the review.
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(reviews).toHaveLength(1);
  });

  it('deletes a pod from the list: the modal names namespace, cluster and environment; the row goes', async () => {
    const { user } = renderApp(POD_LIST);

    const del = await openKebab(user, POD);
    await waitFor(() => expect(del).not.toHaveAttribute('aria-disabled', 'true'));
    await user.click(del);
    const dialog = await screen.findByRole('dialog', { name: 'Delete Pod? dev' });
    expect(dialog).toHaveTextContent(
      `Are you sure you want to delete ${POD} in namespace shop on cluster Development 1?`,
    );
    expect(within(dialog).getByText(POD, { selector: 'strong' })).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    expect(await screen.findByText(`${POD} deleted from Development 1`)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('link', { name: POD })).not.toBeInTheDocument());
    expect(mockK8s.get('dev-1', PodModel, 'shop', POD)).toBeUndefined();
  });

  it("shows the server's 403 detail in the modal", async () => {
    server.use(
      http.delete(PROXY, () =>
        problem(403, { code: 'Proxy.ReadOnlyGrant', detail: 'Your access to dev-1 is read-only.' }),
      ),
    );
    const { user } = renderApp(POD_LIST);

    const del = await openKebab(user, POD);
    await waitFor(() => expect(del).not.toHaveAttribute('aria-disabled', 'true'));
    await user.click(del);
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    expect(await within(dialog).findByText('Your access to dev-1 is read-only.')).toBeInTheDocument();
    expect(mockK8s.get('dev-1', PodModel, 'shop', POD)).toBeDefined();
  });

  it('deletes from the details Actions menu and returns to the list', async () => {
    const { user, router } = renderApp(`${POD_LIST}/${POD}`);

    await user.click(
      await screen.findByRole('button', { name: 'Actions' }, { timeout: COLD_START_TIMEOUT_MS }),
    );
    const del = screen.getByRole('menuitem', { name: 'Delete Pod' });
    await waitFor(() => expect(del).not.toHaveAttribute('aria-disabled', 'true'));
    await user.click(del);
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    expect(await screen.findByText(`${POD} deleted from Development 1`)).toBeInTheDocument();
    await waitFor(() => expect(router.state.location.pathname).toBe(POD_LIST));
  });

  it('toasts even when the watch removed the row before the DELETE response', async () => {
    deleteBeforeResponding(200);
    const { user } = renderApp(POD_LIST);

    const del = await openKebab(user, POD);
    await waitFor(() => expect(del).not.toHaveAttribute('aria-disabled', 'true'));
    await user.click(del);
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(screen.queryByRole('link', { name: POD })).not.toBeInTheDocument());
    expect(await screen.findByText(`${POD} deleted from Development 1`)).toBeInTheDocument();
  });

  it('details: returns to the list when the object vanished first and DELETE answers 404', async () => {
    deleteBeforeResponding(404);
    const { user, router } = renderApp(`${POD_LIST}/${POD}`);

    await user.click(
      await screen.findByRole('button', { name: 'Actions' }, { timeout: COLD_START_TIMEOUT_MS }),
    );
    const del = screen.getByRole('menuitem', { name: 'Delete Pod' });
    await waitFor(() => expect(del).not.toHaveAttribute('aria-disabled', 'true'));
    await user.click(del);
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete' }));

    // The watch turns the page "not found" (dropping the Actions menu and its dialog) before the DELETE answers.
    expect(await screen.findByText(new RegExp(`Pod ${POD} was not found on dev-1\\.`))).toBeInTheDocument();
    expect(await screen.findByText(`${POD} deleted from Development 1`)).toBeInTheDocument();
    await waitFor(() => expect(router.state.location.pathname).toBe(POD_LIST));
  });

  it('words the items as OCP: "Edit <Kind>", "Delete <Kind>", in order and in normal colour', async () => {
    const { user } = renderApp(`${POD_LIST}/${POD}`);

    await user.click(
      await screen.findByRole('button', { name: 'Actions' }, { timeout: COLD_START_TIMEOUT_MS }),
    );
    const items = screen.getAllByRole('menuitem');
    expect(items.map((item) => item.textContent)).toEqual(['Edit Pod', 'Delete Pod']);
    for (const item of items) expect(item.closest('li')).not.toHaveClass('pf-m-danger');
  });

  it('keys the items "edit" and "delete" (ADR-0037 §3 adds edit-labels/edit-annotations next to "edit")', () => {
    renderWithProviders(<ActionKeysProbe />);

    expect(screen.getByText('edit,delete')).toBeInTheDocument();
  });

  it('Edit Pod opens the YAML tab', async () => {
    const { user, router } = renderApp(POD_LIST);

    await user.click(within(await findRow(POD)).getByRole('button', { name: 'Kebab toggle' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Edit Pod' }));

    await waitFor(() => expect(router.state.location.pathname).toBe(`${POD_LIST}/${POD}/yaml`));
  });
});

describe('DeleteResourceModal', () => {
  it('asks for the name when the descriptor requires it (projects)', async () => {
    const { user } = renderWithProviders(
      <DeleteResourceModal
        cluster="dev-1"
        descriptor={projectDescriptor}
        namespace={undefined}
        name="shop"
        onClose={vi.fn()}
      />,
    );

    const dialog = await screen.findByRole('dialog', { name: 'Delete Project? dev' });
    expect(dialog).toHaveTextContent('Are you sure you want to delete shop on cluster Development 1?');
    const confirm = within(dialog).getByRole('button', { name: 'Delete' });
    expect(confirm).toBeDisabled();
    await user.click(within(dialog).getByRole('textbox'));
    await user.paste('shop');
    expect(confirm).toBeEnabled();
  });

  it.each([
    ['checked', true, 'Foreground'],
    ['unchecked', false, 'Orphan'],
  ])(
    'deployments: "Delete dependent objects" %s sends propagationPolicy %s (OCP delete-modal)',
    async (_state, keepChecked, policy) => {
      const bodies: unknown[] = [];
      server.use(
        http.delete(PROXY, async ({ request }) => {
          bodies.push(await request.json());
          return HttpResponse.json({ kind: 'Status', status: 'Success' });
        }),
      );
      const onClose = vi.fn();
      const { user } = renderWithProviders(
        <DeleteResourceModal
          cluster="dev-1"
          descriptor={deploymentDescriptor}
          namespace="shop"
          name="web"
          onClose={onClose}
        />,
      );

      const dialog = await screen.findByRole('dialog', { name: /Delete Deployment\?/ });
      const dependents = within(dialog).getByRole('checkbox', {
        name: 'Delete dependent objects of this resource',
      });
      expect(dependents).toBeChecked();
      if (!keepChecked) await user.click(dependents);
      await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

      await waitFor(() => expect(onClose).toHaveBeenCalled());
      expect(bodies).toEqual([{ kind: 'DeleteOptions', apiVersion: 'v1', propagationPolicy: policy }]);
    },
  );

  it('kinds without a cascade policy (projects) have no dependents checkbox', async () => {
    renderWithProviders(
      <DeleteResourceModal
        cluster="dev-1"
        descriptor={projectDescriptor}
        namespace={undefined}
        name="shop"
        onClose={vi.fn()}
      />,
    );

    const dialog = await screen.findByRole('dialog', { name: 'Delete Project? dev' });
    expect(within(dialog).queryByRole('checkbox')).not.toBeInTheDocument();
  });
});
