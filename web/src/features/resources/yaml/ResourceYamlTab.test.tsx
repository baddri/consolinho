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
import { parseEdited, toEditorText } from './yamlObject';

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
    apiVersion: 'v1',
    kind: 'ConfigMap',
    metadata: {
      name: 'web-config',
      namespace: 'shop',
      resourceVersion: '7',
      managedFields: [{ manager: 'kubectl', operation: 'Apply' }],
    },
    data: { a: 'b' },
  };

  it('hides managedFields unless shown', () => {
    expect(toEditorText(cm, { showManagedFields: false })).not.toContain('managedFields');
    expect(toEditorText(cm, { showManagedFields: true })).toContain('manager: kubectl');
  });

  it('builds the PUT body without managedFields and with the original resourceVersion', () => {
    const text = toEditorText(cm, { showManagedFields: true }).replace(
      'resourceVersion: "7"',
      'resourceVersion: "99"',
    );
    const result = parseEdited(text, cm);
    expect(result).toEqual({
      ok: true,
      obj: { ...cm, metadata: { name: 'web-config', namespace: 'shop', resourceVersion: '7' } },
    });
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
    'hides managedFields until toggled and offers Copy and Download',
    { timeout: COLD_START_TEST_TIMEOUT_MS },
    async () => {
      const cm = storedConfigMap();
      mockK8s.upsert('dev-1', {
        ...cm,
        metadata: { ...cm.metadata, managedFields: [{ manager: 'kubectl', operation: 'Apply' }] },
      });
      const { user } = renderApp(CM_YAML);

      const editor = await findEditor();
      expect(editor.value).toContain('kind: ConfigMap');
      expect(editor.value).not.toContain('managedFields');
      expect(screen.getByRole('button', { name: 'Copy code to clipboard' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Download code' })).toBeInTheDocument();

      await user.click(screen.getByRole('switch', { name: 'Show managed fields' }));
      expect(editor.value).toContain('manager: kubectl');
      expect(screen.getByText('Saving to dev-1')).toBeInTheDocument();
    },
  );

  it('alice on prod-eu-1: read-only editor with the reason and no Save', async () => {
    setMockUser('alice');
    renderApp('/c/prod-eu-1/k8s/ns/shop/pods/web-7d4b9c8f6d-2xkqp/yaml');

    expect(await screen.findByText('Your access to prod-eu-1 is read-only.')).toBeInTheDocument();
    const editor = await findEditor();
    expect(editor).toHaveAttribute('readonly');
    expect(editor.value).toContain('kind: Pod');
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
  });
});

describe('YAML tab save (UI-7, QG-3)', () => {
  it('saves the edit: PUT with the loaded resourceVersion, toast, editor shows the new version', async () => {
    const puts = recordPuts();
    const loadedRv = storedConfigMap().metadata.resourceVersion;
    const { user } = renderApp(CM_YAML);
    const editor = await findEditableEditor();

    await setText(user, editor, withData(editor.value, { greeting: 'hello' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('web-config saved on dev-1')).toBeInTheDocument();
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]).toMatchObject({ data: { greeting: 'hello' }, metadata: { resourceVersion: loadedRv } });
    const saved = storedConfigMap();
    expect(saved.data).toEqual({ greeting: 'hello' });
    await waitFor(() =>
      expect(editor.value).toContain(`resourceVersion: "${saved.metadata.resourceVersion}"`),
    );
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('names the cluster and its environment label next to Save (SW-10)', async () => {
    renderApp(CM_YAML);
    await findEditableEditor();

    // The flex row that holds Save, Reload, the target cluster and its environment label.
    const bar = screen.getByText('Saving to dev-1').parentElement;
    if (!bar) throw new Error('Save bar not found');
    expect(within(bar).getByText('dev')).toBeInTheDocument();
    expect(within(bar).getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('stale edit: banner while dirty, 409 alert on Save, edits kept until Reload', async () => {
    const { user } = renderApp(CM_YAML);
    const editor = await findEditableEditor();
    const edited = withData(editor.value, { mine: 'yes' });
    await setText(user, editor, edited);

    mockK8s.upsert('dev-1', { ...storedConfigMap(), data: { theirs: 'yes' } } as ConfigMapObject);

    expect(await screen.findByText('This object changed on the cluster')).toBeInTheDocument();
    expect(editor.value).toBe(edited);

    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('This object has been updated since you opened it')).toBeInTheDocument();
    expect(editor.value).toBe(edited);
    expect(storedConfigMap().data).toEqual({ theirs: 'yes' });

    // The alert's own Reload action comes first in the DOM; the toolbar's Reload does the same.
    const [alertReload] = screen.getAllByRole('button', { name: 'Reload' });
    if (!alertReload) throw new Error('no Reload action');
    await user.click(alertReload);
    await waitFor(() => expect(editor.value).toContain('theirs: yes'));
    expect(screen.queryByText('This object has been updated since you opened it')).not.toBeInTheDocument();
  });

  it('422: shows the server message and keeps the edits', async () => {
    const { user } = renderApp(CM_YAML);
    const editor = await findEditableEditor();
    const edited = withData(editor.value, { count: 3 });
    await setText(user, editor, edited);

    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText(/data\[count\]: Invalid value: must be a string/)).toBeInTheDocument();
    expect(editor.value).toBe(edited);

    await user.type(editor, ' ');
    expect(screen.queryByText(/data\[count\]: Invalid value/)).not.toBeInTheDocument();
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

    expect(await screen.findByText("web-config can't be saved")).toBeInTheDocument();
    expect(screen.getByText(message)).toBeInTheDocument();
    expect(puts).toEqual([]);
  });

  it('a clean editor follows out-of-band changes', async () => {
    renderApp(CM_YAML);
    const editor = await findEditableEditor();

    mockK8s.upsert('dev-1', { ...storedConfigMap(), data: { live: 'update' } } as ConfigMapObject);

    await waitFor(() => expect(editor.value).toContain('live: update'));
    expect(screen.queryByText('This object changed on the cluster')).not.toBeInTheDocument();
  });

  it('asks before navigating away from unsaved edits', async () => {
    const { user, router } = renderApp(CM_YAML);
    const editor = await findEditableEditor();
    await setText(user, editor, withData(editor.value, { draft: 'x' }));

    await user.click(screen.getByRole('tab', { name: 'Details' }));
    const dialog = await screen.findByRole('dialog', { name: 'Discard unsaved changes?' });
    expect(dialog).toHaveTextContent('Your edits to web-config on dev-1');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(router.state.location.pathname).toBe(CM_YAML);
    expect(editor.value).toContain('draft: x');

    await user.click(screen.getByRole('tab', { name: 'Details' }));
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
