import { screen, waitFor, within } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { parse, stringify } from 'yaml';
import { ConfigMapModel, setWatchTimingForTests, type ConfigMap, type K8sResource } from '@/shared/k8s';
import { COLD_START_TEST_TIMEOUT_MS, COLD_START_TIMEOUT_MS, preloadLazyRoutes } from '@/test/coldStart';
import { mockK8s, setMockUser } from '@/test/handlers';
import { renderApp } from '@/test/render';
import { server } from '@/test/server';
import { resourceRoutes } from '../routes';
import { managedFieldsLine, parseEdited, toEditorText } from './yamlObject';

const PROXY = '*/api/clusters/:cluster/k8s/*';
const CM_YAML = '/c/dev-1/k8s/ns/shop/configmaps/web-config/yaml';

beforeAll(() => preloadLazyRoutes(resourceRoutes));

beforeEach(() => {
  onTestFinished(
    setWatchTimingForTests({ flushMs: 10, initialBackoffMs: 20, maxBackoffMs: 40, minStreamMs: 100 }),
  );
});

type ConfigMapObject = ConfigMap & K8sResource;

const storedConfigMap = () => mockK8s.get('dev-1', ConfigMapModel, 'shop', 'web-config') as ConfigMapObject;

/** Records the JSON bodies of every PUT to the proxy. */
function recordPuts(): unknown[] {
  const bodies: unknown[] = [];
  server.events.on('request:start', ({ request }) => {
    if (request.method === 'PUT' && new URL(request.url).pathname.includes('/k8s/')) {
      void request
        .clone()
        .json()
        .then((body: unknown) => bodies.push(body));
    }
  });
  return bodies;
}

/** The editor double (`__mocks__/YamlEditor.tsx`) once the tab loaded; it is read-only until access is known. */
function findEditor(): Promise<HTMLTextAreaElement> {
  return screen.findByRole<HTMLTextAreaElement>(
    'textbox',
    { name: 'YAML editor' },
    { timeout: COLD_START_TIMEOUT_MS },
  );
}

/** The editor once the update access check allowed editing. */
async function findEditableEditor(): Promise<HTMLTextAreaElement> {
  const editor = await findEditor();
  await waitFor(() => expect(editor).not.toHaveAttribute('readonly'));
  return editor;
}

/** Replaces the editor text as a user would (clear + paste). */
async function setText(user: UserEvent, editor: HTMLTextAreaElement, text: string): Promise<void> {
  await user.clear(editor);
  editor.focus();
  await user.paste(text);
}

/** The editor text with the ConfigMap's `data` replaced. */
function withData(text: string, data: Record<string, unknown>): string {
  return stringify({ ...(parse(text) as ConfigMapObject), data });
}

describe('yamlObject', () => {
  const cm: ConfigMapObject = {
    kind: 'ConfigMap',
    apiVersion: 'v1',
    metadata: {
      name: 'web-config',
      namespace: 'shop',
      resourceVersion: '7',
      creationTimestamp: '2026-11-17T15:07:55Z',
      managedFields: [{ manager: 'kubectl', operation: 'Apply' }],
    },
    data: { a: 'b' },
  };

  it('dumps the object like OCP: key order kept, managedFields included, single quotes, timestamps quoted', () => {
    const text = toEditorText(cm);
    expect(text.split('\n').slice(0, 2)).toEqual(['kind: ConfigMap', 'apiVersion: v1']);
    expect(text).toContain('manager: kubectl');
    expect(text).toContain("resourceVersion: '7'");
    expect(text).toContain("creationTimestamp: '2026-11-17T15:07:55Z'");
  });

  it('finds the managedFields line to fold, if any', () => {
    expect(managedFieldsLine(toEditorText(cm))).toBe(8);
    expect(managedFieldsLine(toEditorText({ ...cm, metadata: { name: 'x' } }))).toBeUndefined();
    expect(managedFieldsLine('managedFields: []\nmetadata: {}')).toBeUndefined();
    expect(managedFieldsLine('kind: [')).toBeUndefined();
  });

  it('builds the PUT body as edited (managedFields kept) with the original resourceVersion', () => {
    const text = toEditorText(cm).replace("resourceVersion: '7'", "resourceVersion: '99'");
    expect(parseEdited(text, cm)).toEqual({ ok: true, obj: cm });
  });

  it.each([
    ['broken YAML', 'kind: [', /^Invalid YAML/],
    ['a list', '- a\n- b', /one object/],
    ['two documents', 'a: 1\n---\nb: 2', /^Invalid YAML/],
    [
      'a changed name',
      stringify({ ...cm, metadata: { ...cm.metadata, name: 'other' } }),
      /^metadata\.name can't/,
    ],
    [
      'a changed namespace',
      stringify({ ...cm, metadata: { ...cm.metadata, namespace: 'x' } }),
      /namespace can't/,
    ],
    ['a changed kind', stringify({ ...cm, kind: 'Secret' }), /^kind can't/],
  ])('rejects %s', (_case, text, message) => {
    const result = parseEdited(text, cm);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(message);
  });
});

describe('YAML tab (UI-6)', () => {
  it(
    'shows managedFields, OCP toolbar and buttons; Download saves <kind>-<name>.yaml',
    { timeout: COLD_START_TEST_TIMEOUT_MS },
    async () => {
      const cm = storedConfigMap();
      mockK8s.upsert('dev-1', {
        ...cm,
        metadata: { ...cm.metadata, managedFields: [{ manager: 'kubectl', operation: 'Apply' }] },
      });
      renderApp(CM_YAML);

      const editor = await findEditor();
      expect(editor.value).toContain('kind: ConfigMap');
      expect(editor.value).toContain('manager: kubectl');
      expect(screen.queryByRole('switch')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Copy code to clipboard' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Editor settings' })).toBeInTheDocument();
      // jsdom has no Fullscreen API, so the control is disabled.
      expect(screen.getByRole('button', { name: 'Toggle fullscreen mode' })).toBeDisabled();

      for (const label of ['Save', 'Reload', 'Cancel']) {
        expect(await screen.findByRole('button', { name: label })).toBeInTheDocument();
      }
      const download = screen.getByRole('link', { name: 'Download' });
      expect(download).toHaveAttribute('download', 'configmap-web-config.yaml');
      expect(decodeURIComponent(download.getAttribute('href') ?? '')).toBe(
        `data:text/yaml;charset=utf-8,${editor.value}`,
      );
    },
  );

  it('Cancel returns to Details', async () => {
    const { user, router } = renderApp(CM_YAML);
    await findEditableEditor();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/c/dev-1/k8s/ns/shop/configmaps/web-config'),
    );
  });

  it('alice on prod-eu-1: read-only editor with the reason and no Save', async () => {
    setMockUser('alice');
    renderApp('/c/prod-eu-1/k8s/ns/shop/pods/web-7d4b9c8f6d-2xkqp/yaml');

    expect(await screen.findByText('Your access to prod-eu-1 is read-only.')).toBeInTheDocument();
    const editor = await findEditor();
    expect(editor).toHaveAttribute('readonly');
    expect(editor.value).toContain('kind: Pod');
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Saving to/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Download' })).toBeInTheDocument();
  });
});

describe('YAML tab save (UI-7, QG-3)', () => {
  it('saves the edit: PUT with the loaded resourceVersion, success alert, editor shows the new version', async () => {
    const puts = recordPuts();
    const loadedRv = storedConfigMap().metadata.resourceVersion;
    const { user } = renderApp(CM_YAML);
    const editor = await findEditableEditor();

    await setText(user, editor, withData(editor.value, { greeting: 'hello' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    const saved = await waitFor(() => {
      const current = storedConfigMap();
      expect(current.data).toEqual({ greeting: 'hello' });
      return current;
    });
    const savedRv = saved.metadata.resourceVersion ?? '';
    expect(await screen.findByText(`web-config has been updated to version ${savedRv}`)).toBeInTheDocument();
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]).toMatchObject({ data: { greeting: 'hello' }, metadata: { resourceVersion: loadedRv } });
    await waitFor(() => expect(editor.value).toContain(`resourceVersion: '${savedRv}'`));
  });

  it('names the cluster and its environment label next to Save (SW-10)', async () => {
    renderApp(CM_YAML);
    await findEditableEditor();

    // The ActionGroup's actions row holds Save, Reload, Cancel, the target cluster with its label, and Download.
    const bar = screen.getByRole('button', { name: 'Save' }).parentElement;
    if (!bar) throw new Error('Button bar not found');
    expect(within(bar).getByText('Saving to dev-1')).toBeInTheDocument();
    expect(within(bar).getByText('dev')).toBeInTheDocument();
  });

  it('stale edit: OCP info alert while dirty, conflict error on Save, edits kept until Reload', async () => {
    const { user } = renderApp(CM_YAML);
    const editor = await findEditableEditor();
    const edited = withData(editor.value, { mine: 'yes' });
    await setText(user, editor, edited);

    mockK8s.upsert('dev-1', { ...storedConfigMap(), data: { theirs: 'yes' } } as ConfigMapObject);

    expect(await screen.findByText('This object has been updated.')).toBeInTheDocument();
    expect(screen.getByText('Click reload to see the new version.')).toBeInTheDocument();
    expect(editor.value).toBe(edited);

    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('An error occurred')).toBeInTheDocument();
    expect(editor.value).toBe(edited);
    expect(storedConfigMap().data).toEqual({ theirs: 'yes' });

    await user.click(screen.getByRole('button', { name: 'Reload' }));
    await waitFor(() => expect(editor.value).toContain('theirs: yes'));
    expect(screen.queryByText('An error occurred')).not.toBeInTheDocument();
    expect(screen.queryByText('This object has been updated.')).not.toBeInTheDocument();
  });

  it('409 before the watch delivers the newer version: the reload hint shows anyway', async () => {
    server.use(
      http.put(PROXY, () =>
        HttpResponse.json(
          {
            kind: 'Status',
            apiVersion: 'v1',
            metadata: {},
            status: 'Failure',
            reason: 'Conflict',
            code: 409,
            message: 'Operation cannot be fulfilled on configmaps "web-config": the object has been modified',
          },
          { status: 409 },
        ),
      ),
    );
    const { user } = renderApp(CM_YAML);
    const editor = await findEditableEditor();
    await setText(user, editor, withData(editor.value, { mine: 'yes' }));

    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText(/the object has been modified/)).toBeInTheDocument();
    expect(screen.getByText('This object has been updated.')).toBeInTheDocument();
    expect(screen.getByText('Click reload to see the new version.')).toBeInTheDocument();
  });

  it('422: shows the server message and keeps the edits until Reload', async () => {
    const { user } = renderApp(CM_YAML);
    const editor = await findEditableEditor();
    const edited = withData(editor.value, { count: 3 });
    await setText(user, editor, edited);

    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText(/data\[count\]: Invalid value: must be a string/)).toBeInTheDocument();
    expect(screen.getByText('An error occurred')).toBeInTheDocument();
    expect(editor.value).toBe(edited);

    await user.click(screen.getByRole('button', { name: 'Reload' }));
    expect(screen.queryByText(/data\[count\]: Invalid value/)).not.toBeInTheDocument();
    expect(editor.value).not.toBe(edited);
  });

  it.each([
    [
      'a changed metadata.name',
      (text: string) => text.replace('name: web-config', 'name: other'),
      /metadata\.name/,
    ],
    ['broken YAML', () => 'kind: [', /Invalid YAML/],
  ])('%s: client-side error and no request', async (_case, edit, message) => {
    const puts = recordPuts();
    const { user } = renderApp(CM_YAML);
    const editor = await findEditableEditor();
    await setText(user, editor, edit(editor.value));

    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('An error occurred')).toBeInTheDocument();
    expect(screen.getByText(message)).toBeInTheDocument();
    expect(puts).toEqual([]);
  });

  it('a clean editor follows out-of-band changes', async () => {
    renderApp(CM_YAML);
    const editor = await findEditableEditor();

    mockK8s.upsert('dev-1', { ...storedConfigMap(), data: { live: 'update' } } as ConfigMapObject);

    await waitFor(() => expect(editor.value).toContain('live: update'));
    expect(screen.queryByText('This object has been updated.')).not.toBeInTheDocument();
  });

  it('asks before navigating away from unsaved edits', async () => {
    const { user, router } = renderApp(CM_YAML);
    const editor = await findEditableEditor();
    await setText(user, editor, withData(editor.value, { draft: 'x' }));

    await user.click(screen.getByRole('tab', { name: 'Details' }));
    const dialog = await screen.findByRole('dialog', { name: 'Discard unsaved changes?' });
    expect(dialog).toHaveTextContent('Your edits to web-config on dev-1');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(router.state.location.pathname).toBe(CM_YAML);
    expect(editor.value).toContain('draft: x');

    // The bar's Cancel leaves the page too, so it asks the same way.
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(await screen.findByRole('button', { name: 'Discard' }));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/c/dev-1/k8s/ns/shop/configmaps/web-config'),
    );
  });
});

// Removing resourceVersion from the text must not turn the save into an unconditional (overwriting) PUT.
it('never sends a PUT without resourceVersion', async () => {
  const puts = recordPuts();
  server.use(http.put(PROXY, () => HttpResponse.json({}, { status: 500 })));
  const { user } = renderApp(CM_YAML);
  const editor = await findEditableEditor();
  await setText(user, editor, withData(editor.value, { x: 'y' }).replace(/\s+resourceVersion: .*\n/, '\n'));

  await user.click(screen.getByRole('button', { name: 'Save' }));

  await waitFor(() => expect(puts).toHaveLength(1));
  expect(puts[0]).toMatchObject({
    metadata: { resourceVersion: storedConfigMap().metadata.resourceVersion },
  });
});
