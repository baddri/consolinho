import { screen, waitFor, within } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { parse, stringify } from 'yaml';
import { DeploymentModel, setWatchTimingForTests } from '@/shared/k8s';
import { COLD_START_TEST_TIMEOUT_MS, COLD_START_TIMEOUT_MS, preloadLazyRoutes } from '@/test/coldStart';
import { mockK8s, setMockUser } from '@/test/handlers';
import { renderApp } from '@/test/render';
import { server } from '@/test/server';
import { resourceRoutes } from '../../../routes';
import { applyFormValues, toFormValues, type DeploymentObject } from './deploymentFormValues';

const PROXY = '*/api/clusters/:cluster/k8s/*';
const DETAILS = '/c/dev-1/k8s/ns/shop/deployments/web';
const FORM = `${DETAILS}/form`;

beforeAll(() => preloadLazyRoutes(resourceRoutes));

/** jsdom has no `scrollIntoView`; revealed advanced options call it (OCP `ProgressiveListItem`). */
const scrollIntoView = vi.fn();

beforeEach(() => {
  Element.prototype.scrollIntoView = scrollIntoView;
  scrollIntoView.mockClear();
  onTestFinished(
    setWatchTimingForTests({ flushMs: 10, initialBackoffMs: 20, maxBackoffMs: 40, minStreamMs: 100 }),
  );
});

const stored = (cluster = 'dev-1') =>
  mockK8s.get(cluster, DeploymentModel, 'shop', 'web') as DeploymentObject;

/** Records the JSON bodies of every PUT to the proxy. */
function recordPuts(): DeploymentObject[] {
  const bodies: DeploymentObject[] = [];
  server.events.on('request:start', ({ request }) => {
    if (request.method === 'PUT' && new URL(request.url).pathname.includes('/k8s/')) {
      void request
        .clone()
        .json()
        .then((body: DeploymentObject) => bodies.push(body));
    }
  });
  return bodies;
}

/** The Replicas input once the form loaded and the update access check enabled it. */
async function findReplicas(user: UserEvent): Promise<HTMLInputElement> {
  await user.click(
    await screen.findByRole('button', { name: 'Scaling' }, { timeout: COLD_START_TIMEOUT_MS }),
  );
  const input = await screen.findByRole<HTMLInputElement>('spinbutton', { name: 'Replicas' });
  expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth' });
  await waitFor(() => expect(input).toBeEnabled());
  return input;
}

async function setReplicas(user: UserEvent, value: string): Promise<void> {
  const input = await findReplicas(user);
  await user.clear(input);
  await user.type(input, value);
}

/** The PF Alert around its title element. */
function alertOf(title: HTMLElement): HTMLElement {
  const alert = title.closest<HTMLElement>('.pf-v6-c-alert');
  if (!alert) throw new Error('no alert');
  return alert;
}

const editorText = () => screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'YAML editor' }).value;

describe('deploymentFormValues', () => {
  it('round-trips the full fixture unchanged (unknown fields preserved)', () => {
    const d = stored();
    expect(applyFormValues(d, toFormValues(d))).toBe(d);
    expect(applyFormValues(d, toFormValues(d))).toEqual(stored());
  });

  it('writes only the fields the form owns', () => {
    const d = stored();
    const next = applyFormValues(d, { paused: true, replicas: 5 });
    expect(next.spec).toEqual({ ...d.spec, paused: true, replicas: 5 });
    expect(next.metadata).toBe(d.metadata);
    expect(next.status).toBe(d.status);
  });
});

describe('EditDeploymentPage', () => {
  it('FORM-1: heading, form view by default, and the toggle remembers YAML view', async () => {
    const first = renderApp(FORM);
    expect(
      await screen.findByRole(
        'heading',
        { level: 1, name: 'Edit Deployment' },
        { timeout: COLD_START_TIMEOUT_MS },
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Form view' })).toBeChecked();
    await first.user.click(screen.getByRole('radio', { name: 'YAML view' }));
    expect(await screen.findByRole('textbox', { name: 'YAML editor' })).toBeInTheDocument();
    first.unmount();

    renderApp(FORM);
    expect(
      await screen.findByRole('radio', { name: 'YAML view' }, { timeout: COLD_START_TIMEOUT_MS }),
    ).toBeChecked();
    expect(screen.getByRole('textbox', { name: 'YAML editor' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Download' })).toHaveAttribute('download', 'deployment-web.yaml');
  });

  it(
    'FORM-3: a form edit shows in YAML and a YAML edit back in the form',
    { timeout: COLD_START_TEST_TIMEOUT_MS },
    async () => {
      const { user } = renderApp(FORM);
      await setReplicas(user, '5');

      await user.click(screen.getByRole('radio', { name: 'YAML view' }));
      const yaml = parse(editorText()) as DeploymentObject;
      expect(yaml.spec?.replicas).toBe(5);

      const editor = screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'YAML editor' });
      await user.clear(editor);
      editor.focus();
      await user.paste(stringify({ ...yaml, spec: { ...yaml.spec, replicas: 7, paused: true } }));
      await user.click(screen.getByRole('radio', { name: 'Form view' }));

      expect(await findReplicas(user)).toHaveValue(7);
      await user.click(screen.getByRole('button', { name: 'Pause rollouts' }));
      expect(screen.getByRole('checkbox', { name: 'Pause rollouts for this deployment' })).toBeChecked();
    },
  );

  it("FORM-3: invalid YAML shows OCP's alert; Cancel stays, Switch and delete drops it", async () => {
    const { user } = renderApp(FORM);
    await setReplicas(user, '5');
    await user.click(screen.getByRole('radio', { name: 'YAML view' }));
    const editor = screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'YAML editor' });
    await user.clear(editor);
    editor.focus();
    await user.paste('spec: [unclosed');

    await user.click(screen.getByRole('radio', { name: 'Form view' }));
    const alert = await screen.findByText('Invalid YAML cannot be persisted');
    expect(screen.getByText('Switching to form view will delete any invalid YAML.')).toBeInTheDocument();
    await user.click(within(alertOf(alert)).getByRole('button', { name: 'Cancel' }));
    expect(alert).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'YAML editor' })).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: 'Form view' }));
    await user.click(await screen.findByRole('button', { name: 'Switch and delete' }));
    expect(await findReplicas(user)).toHaveValue(5);
  });

  it(
    'FORM-3 + Advanced options: Save PUTs once with the resourceVersion, keeps other fields, then shows details',
    { timeout: COLD_START_TEST_TIMEOUT_MS },
    async () => {
      const before = stored();
      const puts = recordPuts();
      const { user, router } = renderApp(FORM);
      const save = await screen.findByRole('button', { name: 'Save' }, { timeout: COLD_START_TIMEOUT_MS });
      expect(save).toBeDisabled();
      expect(screen.getByText('Saving to dev-1')).toBeInTheDocument();

      await setReplicas(user, '5');
      await user.click(screen.getByRole('button', { name: 'Pause rollouts' }));
      await user.click(screen.getByRole('checkbox', { name: 'Pause rollouts for this deployment' }));
      await user.click(save);

      await waitFor(() => expect(router.state.location.pathname).toBe(DETAILS));
      expect(puts).toHaveLength(1);
      const [put] = puts as [DeploymentObject];
      expect(put.metadata.resourceVersion).toBe(before.metadata.resourceVersion);
      expect(put.spec).toEqual({ ...before.spec, replicas: 5, paused: true });
      expect(put.metadata.labels).toEqual(before.metadata.labels);
      expect(stored().spec?.replicas).toBe(5);
      expect(stored().spec?.paused).toBe(true);
    },
  );

  it('FORM-3: a 409 shows the stale alert; Reload starts over', async () => {
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
            message: 'Operation cannot be fulfilled on deployments.apps "web": the object has been modified',
          },
          { status: 409 },
        ),
      ),
    );
    const { user } = renderApp(FORM);
    await setReplicas(user, '5');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText(/the object has been modified/)).toBeInTheDocument();
    expect(screen.getByText('This object has been updated.')).toBeInTheDocument();
    expect(screen.getByText('Click reload to see the new version.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Reload' }));
    expect(screen.queryByText('This object has been updated.')).not.toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: 'Replicas' })).toHaveValue(3);
  });

  it('FORM-3: Cancel returns to details, asking first when dirty', async () => {
    const { user, router } = renderApp(FORM);
    await setReplicas(user, '5');

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    const dialog = await screen.findByRole('dialog', { name: 'Discard unsaved changes?' });
    await user.click(within(dialog).getByRole('button', { name: 'Discard' }));

    await waitFor(() => expect(router.state.location.pathname).toBe(DETAILS));
  });

  it(
    'FORM-3 RO (alice on prod-eu-1): fields disabled, the reason shown, no Save',
    { timeout: COLD_START_TEST_TIMEOUT_MS },
    async () => {
      setMockUser('alice');
      const { user } = renderApp('/c/prod-eu-1/k8s/ns/shop/deployments/web/form');

      expect(
        await screen.findByText(
          'Your access to prod-eu-1 is read-only.',
          {},
          { timeout: COLD_START_TIMEOUT_MS },
        ),
      ).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
    // OCP's DeploymentPage has no project bar.
    expect(screen.queryByRole('button', { name: /^Project:/ })).not.toBeInTheDocument();
      expect(screen.queryByText('Saving to prod-eu-1')).not.toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Scaling' }));
      expect(screen.getByRole('spinbutton', { name: 'Replicas' })).toBeDisabled();
    },
  );
});
