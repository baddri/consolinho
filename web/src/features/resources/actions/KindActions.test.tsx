import { screen, waitFor, within } from '@testing-library/react';
import { http } from 'msw';
import { useState } from 'react';
import { ApiError } from '@/shared/api';
import { k8sPatch, PodModel, type K8sResource } from '@/shared/k8s';
import { mockK8s, problem, setMockUser } from '@/test/handlers';
import { renderWithProviders } from '@/test/render';
import { server } from '@/test/server';
import { podDescriptor } from '../registry/kinds/pods';
import { projectDescriptor } from '../registry/kinds/projects';
import type { KindActionArgs, KindActions, ResourceDescriptor } from '../registry/types';
import { DeleteResourceModal } from './DeleteResourceModal';
import { ResourceActionsMenu } from './ResourceActionsMenu';
import { ResourceMutationModal } from './ResourceMutationModal';
import { ResourceRowActions } from './ResourceRowActions';
import { useActionAccess } from './useActionAccess';
import { useResourceMutation, NO_MESSAGE_FALLBACK } from './useResourceMutation';

const PROXY = '*/api/clusters/:cluster/k8s/*';
const POD = 'web-7d4b9c8f6d-2xkqp';
const pod: K8sResource = { apiVersion: 'v1', kind: 'Pod', metadata: { name: POD, namespace: 'shop' } };
const project: K8sResource = { apiVersion: 'project.openshift.io/v1', kind: 'Project', metadata: { name: 'shop' } };

/** Records the method and path of every PATCH the proxy receives. */
function recordPatches(): string[] {
  const patches: string[] = [];
  server.events.on('request:start', ({ request }) => {
    if (request.method === 'PATCH') patches.push(new URL(request.url).pathname);
  });
  return patches;
}

/** A descriptor with a stub kind hook: "Annotate" (a real JSON Patch, gated like every write) and "Inspect". */
function withStubActions(descriptor: ResourceDescriptor): ResourceDescriptor {
  return {
    ...descriptor,
    useKindActions: function useStubActions({ cluster, obj, reviewByName }: KindActionArgs): KindActions {
      const { model } = descriptor;
      const target = { namespace: obj.metadata.namespace, name: obj.metadata.name ?? '' };
      const access = useActionAccess(cluster, { verb: 'patch', model, ...target }, reviewByName);
      const mutation = useResourceMutation(cluster, {
        model,
        mutationFn: (vars: typeof target) =>
          k8sPatch(cluster, model, vars, [
            { op: 'add', path: '/metadata/annotations', value: { stub: 'yes' } },
          ]),
        successMessage: ({ name }) => `${name} annotated`,
        toastErrors: { action: 'Annotate' },
      });
      return {
        items: [
          {
            itemKey: 'annotate',
            title: 'Annotate',
            onClick: () => {
              if (!access.isAriaDisabled) mutation.mutate(target);
            },
            ...access,
          },
          { itemKey: 'inspect', title: 'Inspect', onClick: () => undefined },
        ],
        dialog: null,
      };
    },
  };
}

const stubPods = withStubActions(podDescriptor);

describe('kind actions engine (ADR-0037 §3)', () => {
  it('ACT-1: kind items come before Edit <Kind> and Delete <Kind> in the details menu', async () => {
    const { user } = renderWithProviders(
      <ResourceActionsMenu cluster="dev-1" descriptor={stubPods} obj={pod} />,
    );

    await user.click(screen.getByRole('button', { name: 'Actions' }));
    const items = screen.getAllByRole('menuitem').map((item) => item.textContent);
    expect(items).toEqual(['Annotate', 'Inspect', 'Edit Pod', 'Delete Pod']);
  });

  it('ACT-1: and in the row kebab', async () => {
    const { user } = renderWithProviders(
      <table>
        <tbody>
          <tr>
            <ResourceRowActions cluster="dev-1" descriptor={stubPods} obj={pod} />
          </tr>
        </tbody>
      </table>,
    );

    await user.click(screen.getByRole('button', { name: 'Kebab toggle' }));
    const items = (await screen.findAllByRole('menuitem')).map((item) => item.textContent);
    expect(items).toEqual(['Annotate', 'Inspect', 'Edit Pod', 'Delete Pod']);
  });

  it.each([
    ['alice', 'prod-eu-1', stubPods, pod, 'Your access to prod-eu-1 is read-only.'],
    ['ines', 'prod-us-1', stubPods, pod, 'Your account is read-only.'],
    [
      'carol',
      'prod-eu-1',
      withStubActions(projectDescriptor),
      project,
      'The service account for prod-eu-1 cannot patch projects (cluster RBAC).',
    ],
  ])('ACT-4: %s on %s: the kind item is aria-disabled with "%s" and sends nothing', async (persona, cluster, descriptor, obj, reason) => {
    setMockUser(persona);
    const patches = recordPatches();
    const { user } = renderWithProviders(
      <ResourceActionsMenu cluster={cluster} descriptor={descriptor} obj={obj} />,
    );

    await user.click(screen.getByRole('button', { name: 'Actions' }));
    const annotate = screen.getByRole('menuitem', { name: 'Annotate' });
    await user.hover(annotate);
    expect(await screen.findByRole('tooltip')).toHaveTextContent(reason);
    expect(annotate).toHaveAttribute('aria-disabled', 'true');
    await user.click(annotate);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(patches).toEqual([]);
  });

  it('ACT-6: success toasts the object and the cluster display name; the patch is applied', async () => {
    const { user } = renderWithProviders(
      <ResourceActionsMenu cluster="dev-1" descriptor={stubPods} obj={pod} />,
    );

    await user.click(screen.getByRole('button', { name: 'Actions' }));
    const annotate = screen.getByRole('menuitem', { name: 'Annotate' });
    await waitFor(() => expect(annotate).not.toHaveAttribute('aria-disabled', 'true'));
    await user.click(annotate);

    expect(await screen.findByText(`${POD} annotated on Development 1`)).toBeInTheDocument();
    expect(mockK8s.get('dev-1', PodModel, 'shop', POD)?.metadata.annotations).toEqual({ stub: 'yes' });
  });

  it.each([
    ['the server message', 'pods "web" is forbidden', 'pods "web" is forbidden'],
    ['a fallback for an empty message', '', NO_MESSAGE_FALLBACK],
  ])('ACT-6: a modal-less failure toasts "<action> failed" with %s', async (_case, detail, shown) => {
    server.use(http.patch(PROXY, () => problem(403, { code: 'Kubernetes.Forbidden', detail })));
    const { user } = renderWithProviders(
      <ResourceActionsMenu cluster="dev-1" descriptor={stubPods} obj={pod} />,
    );

    await user.click(screen.getByRole('button', { name: 'Actions' }));
    const annotate = screen.getByRole('menuitem', { name: 'Annotate' });
    await waitFor(() => expect(annotate).not.toHaveAttribute('aria-disabled', 'true'));
    await user.click(annotate);

    expect(await screen.findByText('Annotate failed')).toBeInTheDocument();
    expect(screen.getByText(shown)).toBeInTheDocument();
  });
});

/** A `ResourceMutationModal` around one text field, saving through `onSave`. */
function StubModal({ error, onSave }: { error?: unknown; onSave: () => void }) {
  const [value, setValue] = useState('');
  return (
    <ResourceMutationModal
      title="Edit thing"
      cluster="prod-eu-1"
      namespace="shop"
      objectName="web"
      kindLabel="Deployment"
      isSaving={false}
      error={error}
      onSave={onSave}
      onClose={vi.fn()}
    >
      <input aria-label="Value" value={value} onChange={(event) => setValue(event.target.value)} />
    </ResourceMutationModal>
  );
}

describe('ResourceMutationModal (SAFE-1)', () => {
  beforeEach(() => setMockUser('carol'));

  it('names object, namespace, cluster display name and environment; Enter saves', async () => {
    const onSave = vi.fn();
    const { user } = renderWithProviders(<StubModal onSave={onSave} />);

    const dialog = await screen.findByRole('dialog', { name: 'Edit thing' });
    await waitFor(() =>
      expect(dialog).toHaveTextContent('Deployment web in shop on Production EU 1 prod'),
    );
    expect(within(dialog).getByText('Production EU 1', { selector: 'strong' })).toBeInTheDocument();
    await user.type(within(dialog).getByRole('textbox', { name: 'Value' }), 'x{Enter}');
    expect(onSave).toHaveBeenCalledTimes(1);
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledTimes(2);
  });

  it('optionally shows a header description and focuses a given field on open', async () => {
    renderWithProviders(
      <ResourceMutationModal
        title="Edit thing"
        cluster="prod-eu-1"
        namespace="shop"
        objectName="web"
        kindLabel="Deployment"
        isSaving={false}
        error={undefined}
        onSave={vi.fn()}
        onClose={vi.fn()}
        description="Things maintain themselves."
        elementToFocus="#stub-field"
      >
        <input id="stub-field" aria-label="Value" />
      </ResourceMutationModal>,
    );

    const dialog = await screen.findByRole('dialog', { name: 'Edit thing' });
    expect(dialog).toHaveAccessibleDescription('Things maintain themselves.');
    await waitFor(() => expect(within(dialog).getByRole('textbox', { name: 'Value' })).toHaveFocus());
  });

  it('shows a failure inline with the server message, never blank', async () => {
    const error = new ApiError({ status: 403, title: 'Forbidden', code: undefined, detail: undefined });
    renderWithProviders(<StubModal error={error} onSave={vi.fn()} />);

    const dialog = await screen.findByRole('dialog', { name: 'Edit thing' });
    expect(within(dialog).getByText('An error occurred')).toBeInTheDocument();
    expect(within(dialog).getByText(NO_MESSAGE_FALLBACK)).toBeInTheDocument();
  });

  it('the delete modal names the production cluster by display name with its environment label', async () => {
    renderWithProviders(
      <DeleteResourceModal
        cluster="prod-eu-1"
        descriptor={podDescriptor}
        namespace="shop"
        name={POD}
        onClose={vi.fn()}
      />,
    );

    const dialog = await screen.findByRole('dialog', { name: 'Delete Pod? prod' });
    expect(dialog).toHaveTextContent(
      `Are you sure you want to delete ${POD} in namespace shop on cluster Production EU 1?`,
    );
  });
});
