import { screen, waitFor, within } from '@testing-library/react';
import { http } from 'msw';
import { PodModel, setWatchTimingForTests, type K8sResource } from '@/shared/k8s';
import { COLD_START_TIMEOUT_MS, preloadLazyRoutes } from '@/test/coldStart';
import { mockK8s, problem, setMockUser } from '@/test/handlers';
import { renderApp, renderWithProviders } from '@/test/render';
import { server } from '@/test/server';
import { podDescriptor } from '../registry/kinds/pods';
import { resourceRoutes } from '../routes';
import { EditAnnotationsModal } from './EditAnnotationsModal';
import { EditLabelsModal } from './EditLabelsModal';
import { labelEntryErrors, metadataKeyError, labelValueError, rowsToAnnotations } from './labelValidation';
import { ResourceActionsMenu } from './ResourceActionsMenu';

const PROXY = '*/api/clusters/:cluster/k8s/*';
const POD = 'web-7d4b9c8f6d-2xkqp';
const POD_URL = `/c/dev-1/k8s/ns/shop/pods/${POD}`;
/** The pod as a menu gets it: no labels or annotations, so saves `add` the map. */
const bare: K8sResource = { apiVersion: 'v1', kind: 'Pod', metadata: { name: POD, namespace: 'shop' } };

beforeAll(() => preloadLazyRoutes(resourceRoutes));

beforeEach(() => {
  onTestFinished(
    setWatchTimingForTests({ flushMs: 10, initialBackoffMs: 20, maxBackoffMs: 40, minStreamMs: 100 }),
  );
});

/** Records the JSON body of every PATCH the proxy receives. */
function recordPatchBodies(): unknown[] {
  const bodies: unknown[] = [];
  server.events.on('request:start', ({ request }) => {
    if (request.method === 'PATCH')
      void request
        .clone()
        .json()
        .then((body: unknown) => bodies.push(body));
  });
  return bodies;
}

/** The `index`th element, failing the test when there is none. */
function nth<T>(list: readonly T[], index: number): T {
  const item = list[index];
  if (item === undefined) throw new Error(`no element ${String(index)}`);
  return item;
}

function renderLabels(obj: K8sResource = bare) {
  const onClose = vi.fn();
  const result = renderWithProviders(
    <EditLabelsModal cluster="dev-1" model={PodModel} obj={obj} onClose={onClose} />,
  );
  return { ...result, onClose };
}

describe('labelValidation', () => {
  it.each([
    ['app', undefined],
    ['app.kubernetes.io/name', undefined],
    ['', 'Key is required.'],
    ['bad key', 'Key "bad key": the name'],
    ['Upper.Case/x', 'Key "Upper.Case/x": the prefix'],
    ['a'.repeat(64), 'the name must be 63 characters or less'],
  ])('key %j → %s', (key, error) => {
    const message = metadataKeyError(key);
    if (error === undefined) expect(message).toBeUndefined();
    else expect(message).toContain(error);
  });

  it('values may be empty but follow the name rule otherwise', () => {
    expect(labelValueError('')).toBeUndefined();
    expect(labelValueError('v1.2_x-y')).toBeUndefined();
    expect(labelValueError('-x')).toContain('start and end with an alphanumeric');
  });

  it('flags the later of two entries with the same key', () => {
    expect([...labelEntryErrors(['app=a', 'tier', 'app=b'])]).toEqual([[2, 'Duplicate key "app".']]);
  });

  it('annotations drop blank keys and trim the others', () => {
    expect(
      rowsToAnnotations([
        { key: ' a ', value: '1' },
        { key: '', value: 'x' },
      ]),
    ).toEqual({ a: '1' });
  });
});

describe('Edit labels (ACT-2)', () => {
  it('details: prefilled, names object and cluster, one JSON Patch, the new label shows without reload', async () => {
    const bodies = recordPatchBodies();
    const { user } = renderApp(POD_URL);

    await user.click(
      await screen.findByRole('button', { name: 'Actions' }, { timeout: COLD_START_TIMEOUT_MS }),
    );
    const item = screen.getByRole('menuitem', { name: 'Edit labels' });
    await waitFor(() => expect(item).not.toHaveAttribute('aria-disabled', 'true'));
    await user.click(item);

    const dialog = await screen.findByRole('dialog', { name: 'Edit labels' });
    await waitFor(() => expect(dialog).toHaveTextContent(`Pod ${POD} in shop on Development 1`));
    expect(dialog).toHaveTextContent('Labels help you organize and select resources.');
    expect(within(dialog).getByText('app=web')).toBeInTheDocument();
    expect(within(dialog).getByText('pod-template-hash=7d4b9c8f6d')).toBeInTheDocument();

    await user.type(within(dialog).getByRole('textbox', { name: 'Labels' }), 'tier=frontend{Enter}');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(await screen.findByText(`Labels of ${POD} updated on Development 1`)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(bodies).toEqual([
      [
        {
          op: 'replace',
          path: '/metadata/labels',
          value: { app: 'web', 'pod-template-hash': '7d4b9c8f6d', tier: 'frontend' },
        },
      ],
    ]);
    expect(await screen.findByText('tier=frontend')).toBeInTheDocument();
  });

  it('adds on Enter, comma and space; Backspace and the close button remove; `add` when there were none', async () => {
    const bodies = recordPatchBodies();
    const { user, onClose } = renderLabels();

    const dialog = await screen.findByRole('dialog', { name: 'Edit labels' });
    const input = within(dialog).getByRole('textbox', { name: 'Labels' });
    expect(input).toHaveAttribute('placeholder', 'app=frontend');
    await user.type(input, 'a=1{Enter}b=2,c=3 d=4 ');
    await user.type(input, '{Backspace}');
    expect(within(dialog).queryByText('d=4')).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Remove b=2' }));
    await user.type(input, 'flag');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(bodies).toEqual([[{ op: 'add', path: '/metadata/labels', value: { a: '1', c: '3', flag: '' } }]]);
    expect(mockK8s.get('dev-1', PodModel, 'shop', POD)?.metadata.labels).toEqual({
      a: '1',
      c: '3',
      flag: '',
    });
  });

  it('an invalid or duplicate entry puts the input in error with the reason and disables Save (OCP isInputValid)', async () => {
    const bodies = recordPatchBodies();
    const { user } = renderLabels({ ...bare, metadata: { ...bare.metadata, labels: { app: 'web' } } });

    const dialog = await screen.findByRole('dialog', { name: 'Edit labels' });
    const input = within(dialog).getByRole('textbox', { name: 'Labels' });
    const save = within(dialog).getByRole('button', { name: 'Save' });
    // Enter does not add invalid text: it stays in the input, flagged.
    await user.type(input, '-bad=x{Enter}');
    expect(input).toHaveValue('-bad=x');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(
      within(dialog).getByText(/Key "-bad": the name must be 63 characters or less/),
    ).toBeInTheDocument();
    expect(save).toBeDisabled();

    await user.clear(input);
    await user.type(input, 'app=other{Enter}');
    expect(within(dialog).getByText('Duplicate key "app".')).toBeInTheDocument();
    expect(save).toBeDisabled();
    await user.type(input, '{Enter}');
    expect(bodies).toEqual([]);

    await user.clear(input);
    expect(save).toBeEnabled();
    expect(input).toHaveAttribute('aria-invalid', 'false');
  });

  it('opens as a medium modal; labels are plain closable labels (OCP SelectorInput)', async () => {
    renderLabels({ ...bare, metadata: { ...bare.metadata, labels: { a: '1' } } });

    const dialog = await screen.findByRole('dialog', { name: 'Edit labels' });
    expect(dialog).toHaveClass('pf-m-md');
    expect(within(dialog).queryByRole('button', { name: 'a=1' })).not.toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Remove a=1' })).toBeInTheDocument();
  });

  it('ACT-6: a 422 shows the cluster message inline and keeps the dialog open', async () => {
    server.use(
      http.patch(PROXY, () =>
        problem(422, { code: 'Kubernetes.Invalid', detail: 'metadata.labels: Invalid value: "x"' }),
      ),
    );
    const { user, onClose } = renderLabels();

    const dialog = await screen.findByRole('dialog', { name: 'Edit labels' });
    await user.type(within(dialog).getByRole('textbox', { name: 'Labels' }), 'a=b{Enter}');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(await within(dialog).findByText('An error occurred')).toBeInTheDocument();
    expect(within(dialog).getByText('metadata.labels: Invalid value: "x"')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('Edit annotations (ACT-3)', () => {
  it('starts with one blank row; Add more, remove; blank rows ignored; patches /metadata/annotations', async () => {
    const bodies = recordPatchBodies();
    const onClose = vi.fn();
    const { user } = renderWithProviders(
      <EditAnnotationsModal cluster="dev-1" model={PodModel} obj={bare} onClose={onClose} />,
    );

    const dialog = await screen.findByRole('dialog', { name: 'Edit annotations' });
    await waitFor(() => expect(dialog).toHaveTextContent(`Pod ${POD} in shop on Development 1`));
    expect(within(dialog).getAllByRole('textbox', { name: 'Key' })).toHaveLength(1);
    await user.type(within(dialog).getByRole('textbox', { name: 'Key' }), 'note');
    await user.type(within(dialog).getByRole('textbox', { name: 'Value' }), 'hello world');
    await user.click(within(dialog).getByRole('button', { name: 'Add more' }));
    await user.click(within(dialog).getByRole('button', { name: 'Add more' }));
    const keys = within(dialog).getAllByRole('textbox', { name: 'Key' });
    expect(keys).toHaveLength(3);
    await user.type(nth(keys, 1), 'drop-me');
    await user.click(nth(within(dialog).getAllByRole('button', { name: 'Remove' }), 1));
    expect(within(dialog).getAllByRole('textbox', { name: 'Key' })).toHaveLength(2);
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(bodies).toEqual([[{ op: 'add', path: '/metadata/annotations', value: { note: 'hello world' } }]]);
    expect(await screen.findByText(`Annotations of ${POD} updated on Development 1`)).toBeInTheDocument();
  });

  it('prefills, `replace`s, and reports a duplicate key on the field without saving', async () => {
    const bodies = recordPatchBodies();
    const obj = { ...bare, metadata: { ...bare.metadata, annotations: { a: '1', b: '2' } } };
    const { user } = renderWithProviders(
      <EditAnnotationsModal cluster="dev-1" model={PodModel} obj={obj} onClose={vi.fn()} />,
    );

    const dialog = await screen.findByRole('dialog', { name: 'Edit annotations' });
    const keys = within(dialog).getAllByRole('textbox', { name: 'Key' });
    expect(keys.map((key) => (key as HTMLInputElement).value)).toEqual(['a', 'b']);
    await user.clear(nth(keys, 1));
    await user.type(nth(keys, 1), 'a');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(await within(dialog).findByText('Duplicate key "a".')).toBeInTheDocument();
    expect(nth(keys, 1)).toHaveAttribute('aria-invalid', 'true');
    expect(bodies).toEqual([]);

    await user.clear(nth(keys, 1));
    await user.type(nth(keys, 1), 'c');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(bodies).toEqual([[{ op: 'replace', path: '/metadata/annotations', value: { a: '1', c: '2' } }]]),
    );
  });
});

describe('Edit annotations: large modal, failures (ACT-6)', () => {
  it('is large, the remove button has a "Remove" tooltip, and a 422 shows inline', async () => {
    server.use(
      http.patch(PROXY, () =>
        problem(422, { code: 'Kubernetes.Invalid', detail: 'metadata.annotations: Too long' }),
      ),
    );
    const onClose = vi.fn();
    const { user } = renderWithProviders(
      <EditAnnotationsModal cluster="dev-1" model={PodModel} obj={bare} onClose={onClose} />,
    );

    const dialog = await screen.findByRole('dialog', { name: 'Edit annotations' });
    expect(dialog).toHaveClass('pf-m-lg');
    await user.hover(within(dialog).getByRole('button', { name: 'Remove' }));
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Remove');
    await user.type(within(dialog).getByRole('textbox', { name: 'Key' }), 'note');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(await within(dialog).findByText('An error occurred')).toBeInTheDocument();
    expect(within(dialog).getByText('metadata.annotations: Too long')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('access (ACT-4)', () => {
  it.each(['Edit labels', 'Edit annotations'])(
    'alice on prod-eu-1: %s is aria-disabled with the reason and opens nothing',
    async (title) => {
      setMockUser('alice');
      const bodies = recordPatchBodies();
      const { user } = renderWithProviders(
        <ResourceActionsMenu cluster="prod-eu-1" descriptor={podDescriptor} obj={bare} />,
      );

      await user.click(screen.getByRole('button', { name: 'Actions' }));
      const item = screen.getByRole('menuitem', { name: title });
      await user.hover(item);
      expect(await screen.findByRole('tooltip')).toHaveTextContent('Your access to prod-eu-1 is read-only.');
      expect(item).toHaveAttribute('aria-disabled', 'true');
      await user.click(item);
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(bodies).toEqual([]);
    },
  );
});
