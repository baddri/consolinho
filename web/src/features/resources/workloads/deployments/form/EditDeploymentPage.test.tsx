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
import type { EnvRow } from './deploymentFormSchema';
import {
  applyFormValues,
  blankRefRow,
  blankValueRow,
  toFormValues,
  type DeploymentObject,
} from './deploymentFormValues';

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

/** `deployment` with a second container, `sidecar`, after `web`. */
function withSidecar(deployment: DeploymentObject): DeploymentObject {
  const { spec } = deployment;
  if (!spec?.template.spec) throw new Error('fixture has no pod template');
  const sidecar = { name: 'sidecar', image: 'quay.io/example/proxy:1' };
  return {
    ...deployment,
    spec: {
      ...spec,
      template: {
        ...spec.template,
        spec: { ...spec.template.spec, containers: [...spec.template.spec.containers, sidecar] },
      },
    },
  };
}

/** `value`, failing the test when a query found nothing. */
function defined<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error('expected an element');
  return value;
}

const POD_IP = { name: 'POD_IP', valueFrom: { fieldRef: { fieldPath: 'status.podIP' } } };
const ENV_FROM = [{ configMapRef: { name: 'web-config' } }];

/** The fixture with env (two values and a fieldRef) and `envFrom` on its first container. */
function withEnv(deployment: DeploymentObject): DeploymentObject {
  const { spec } = deployment;
  if (!spec?.template.spec) throw new Error('fixture has no pod template');
  const [first, ...rest] = spec.template.spec.containers;
  if (!first) throw new Error('fixture has no container');
  const env = [{ name: 'MODE', value: 'prod' }, { name: 'OLD', value: 'x' }, POD_IP];
  return {
    ...deployment,
    spec: {
      ...spec,
      template: {
        ...spec.template,
        spec: { ...spec.template.spec, containers: [{ ...first, env, envFrom: ENV_FROM }, ...rest] },
      },
    },
  };
}

/** Picks `option` from the PF Select whose toggle is labelled `label`. */
async function pick(user: UserEvent, label: string, option: string): Promise<void> {
  await user.click(screen.getByRole('button', { name: label }));
  await user.click(await screen.findByRole('option', { name: option }));
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
    const next = applyFormValues(d, { ...toFormValues(d), paused: true, replicas: 5 });
    expect(next.spec).toEqual({ ...d.spec, paused: true, replicas: 5 });
    expect(next.metadata).toBe(d.metadata);
    expect(next.status).toBe(d.status);
  });

  it('writes the strategy: bounds parsed, Recreate drops rollingUpdate', () => {
    const d = stored();
    const rolling = applyFormValues(d, { ...toFormValues(d), maxSurge: ' 1 ', maxUnavailable: '' });
    expect(rolling.spec?.strategy).toEqual({
      type: 'RollingUpdate',
      rollingUpdate: { maxSurge: 1, maxUnavailable: '25%' },
    });
    const recreate = applyFormValues(d, { ...toFormValues(d), strategyType: 'Recreate' });
    expect(recreate.spec?.strategy).toEqual({ type: 'Recreate' });
    expect(recreate.spec?.template).toBe(d.spec?.template);
  });

  it('round-trips env with refs unchanged, keeping the same container object', () => {
    const d = withEnv(stored());
    const container = d.spec?.template.spec?.containers[0];
    const next = applyFormValues(d, toFormValues(d));
    expect(next).toEqual(d);
    expect(next.spec?.template.spec?.containers[0]).toBe(container);
  });

  it('writes env rows: blank rows dropped, empty values kept by name, refs and fieldRefs mapped, envFrom kept', () => {
    const d = withEnv(stored());
    const values = toFormValues(d);
    const [first] = values.containers;
    if (!first) throw new Error('no container');
    const [mode, , podIp] = first.env;
    if (!mode || !podIp) throw new Error('rows missing');
    const env: EnvRow[] = [
      { type: 'value', name: 'MODE', value: '', source: mode.source },
      { ...podIp, name: 'MY_IP' },
      blankValueRow(),
      { ...blankRefRow(), name: 'USER', refKind: 'Secret', refName: 'db-credentials', key: 'username' },
      blankRefRow(),
    ];
    const next = applyFormValues(d, { ...values, containers: [{ ...first, env }] });
    expect(next.spec?.template.spec?.containers[0]).toMatchObject({
      env: [
        { name: 'MODE' },
        { ...POD_IP, name: 'MY_IP' },
        { name: 'USER', valueFrom: { secretKeyRef: { name: 'db-credentials', key: 'username' } } },
      ],
      envFrom: ENV_FROM,
    });
    const cleared = applyFormValues(d, { ...values, containers: [{ ...first, env: [blankValueRow()] }] });
    expect(cleared.spec?.template.spec?.containers[0]).not.toHaveProperty('env');
    expect(cleared.spec?.template.spec?.containers[0]?.envFrom).toEqual(ENV_FROM);
  });

  it('Pull Secret: blank or an already listed secret changes nothing; another one is appended (OCP)', () => {
    const d = stored();
    expect(toFormValues(d).imagePullSecret).toBe('');
    const picked = applyFormValues(d, { ...toFormValues(d), imagePullSecret: 'registry-pull' });
    expect(picked.spec?.template.spec).toEqual({
      ...d.spec?.template.spec,
      imagePullSecrets: [{ name: 'registry-pull' }],
    });
    expect(picked.spec?.template.spec?.containers).toBe(d.spec?.template.spec?.containers);
    expect(toFormValues(picked).imagePullSecret).toBe('registry-pull');
    expect(applyFormValues(picked, toFormValues(picked))).toBe(picked);
    const other = applyFormValues(picked, { ...toFormValues(picked), imagePullSecret: 'other-pull' });
    expect(other.spec?.template.spec?.imagePullSecrets).toEqual([
      { name: 'registry-pull' },
      { name: 'other-pull' },
    ]);
  });

  it("writes one container's image by name; the others stay the same objects", () => {
    const d = withSidecar(stored());
    const [web, sidecar] = d.spec?.template.spec?.containers ?? [];
    const next = applyFormValues(d, {
      ...toFormValues(d),
      containers: [{ name: 'sidecar', image: 'quay.io/example/proxy:2', env: [blankValueRow()] }],
    });
    const containers = next.spec?.template.spec?.containers;
    expect(containers?.[0]).toBe(web);
    expect(containers?.[1]).toEqual({ ...sidecar, image: 'quay.io/example/proxy:2' });
    expect(next.spec?.strategy).toBe(d.spec?.strategy);
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
    const editor = await screen.findByRole('textbox', { name: 'YAML editor' });
    // The editor double exposes the handed-over schema URI: the cluster's Deployment schema, as the YAML tab.
    await waitFor(() =>
      expect(editor).toHaveAttribute('data-schema-uri', 'fleetconsole://schema/dev-1/apps/v1/Deployment'),
    );
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
      expect(screen.getByRole('button', { name: 'Strategy type' })).toBeDisabled();
      expect(screen.getByRole('textbox', { name: /Image Name/ })).toBeDisabled();
      expect(screen.queryByText('Saving to prod-eu-1')).not.toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Scaling' }));
      expect(screen.getByRole('spinbutton', { name: 'Replicas' })).toBeDisabled();
    },
  );

  it(
    "FORM-2: the strategy and one container's image reach YAML and the PUT; the other container is untouched",
    { timeout: COLD_START_TEST_TIMEOUT_MS },
    async () => {
      mockK8s.upsert('dev-1', withSidecar(stored()));
      const before = stored();
      const puts = recordPuts();
      const { user, router } = renderApp(FORM);
      const strategy = await screen.findByRole(
        'button',
        { name: 'Strategy type' },
        { timeout: COLD_START_TIMEOUT_MS },
      );
      await waitFor(() => expect(strategy).toBeEnabled());
      expect(strategy).toHaveTextContent('Rolling Update');
      expect(screen.getByText(/The rolling strategy will wait/)).toBeInTheDocument();

      const surge = screen.getByRole('textbox', { name: 'Maximum number of surge Pods' });
      await user.clear(surge);
      await user.type(surge, '1');
      await user.click(screen.getByRole('radio', { name: 'YAML view' }));
      expect((parse(editorText()) as DeploymentObject).spec?.strategy).toEqual({
        type: 'RollingUpdate',
        rollingUpdate: { maxSurge: 1, maxUnavailable: '25%' },
      });
      await user.click(screen.getByRole('radio', { name: 'Form view' }));

      await pick(user, 'Strategy type', 'Recreate');
      expect(screen.getByText('The recreate strategy has basic rollout behavior.')).toBeInTheDocument();
      expect(screen.queryByRole('textbox', { name: 'Maximum number of surge Pods' })).not.toBeInTheDocument();
      expect(screen.getByRole('textbox', { name: /Image Name/ })).toHaveValue(
        'quay.io/example/web:1.5.0-rc.1',
      );
      // Images and Environment Variables share the container choice; pick it in Images.
      await user.click(defined(screen.getAllByRole('button', { name: 'Container' })[0]));
      await user.click(await screen.findByRole('option', { name: 'sidecar' }));
      const image = screen.getByRole('textbox', { name: /Image Name/ });
      expect(image).toHaveValue('quay.io/example/proxy:1');
      await user.clear(image);
      await user.type(image, 'quay.io/example/proxy:2');

      const [web, sidecar] = before.spec?.template.spec?.containers ?? [];
      const expected = {
        ...before.spec,
        strategy: { type: 'Recreate' },
        template: {
          ...before.spec?.template,
          spec: {
            ...before.spec?.template.spec,
            containers: [web, { ...sidecar, image: 'quay.io/example/proxy:2' }],
          },
        },
      };
      await user.click(screen.getByRole('radio', { name: 'YAML view' }));
      expect((parse(editorText()) as DeploymentObject).spec).toEqual(expected);
      await user.click(screen.getByRole('button', { name: 'Save' }));

      await waitFor(() => expect(router.state.location.pathname).toBe(DETAILS));
      expect(puts).toHaveLength(1);
      expect(puts[0]?.spec).toEqual(expected);
    },
  );

  it(
    'FORM-2 zod: an empty image and an invalid bound show inline errors and disable Save',
    { timeout: COLD_START_TEST_TIMEOUT_MS },
    async () => {
      const { user } = renderApp(FORM);
      const image = await screen.findByRole(
        'textbox',
        { name: /Image Name/ },
        { timeout: COLD_START_TIMEOUT_MS },
      );
      await waitFor(() => expect(image).toBeEnabled());
      const save = screen.getByRole('button', { name: 'Save' });

      await user.clear(image);
      expect(await screen.findByText('Required')).toBeInTheDocument();
      expect(image).toHaveAttribute('aria-invalid', 'true');
      expect(save).toBeDisabled();
      await user.type(image, 'quay.io/example/web:2');
      await waitFor(() => expect(save).toBeEnabled());

      const unavailable = screen.getByRole('textbox', { name: 'Maximum number of unavailable Pods' });
      await user.clear(unavailable);
      await user.type(unavailable, 'ten');
      expect(
        await screen.findByText('Enter a whole number of pods or a percentage, e.g. 25%.'),
      ).toBeInTheDocument();
      expect(save).toBeDisabled();
      // The bounds don't apply to Recreate, so they stop blocking Save.
      await pick(user, 'Strategy type', 'Recreate');
      await waitFor(() => expect(save).toBeEnabled());
    },
  );

  it(
    'FORM-ENV: edit, remove and add values and ConfigMap/Secret keys; fieldRef and envFrom survive; no Secret values',
    { timeout: COLD_START_TEST_TIMEOUT_MS },
    async () => {
      mockK8s.upsert('dev-1', withEnv(stored()));
      const before = stored();
      const puts = recordPuts();
      const { user, router } = renderApp(FORM);
      const heading = await screen.findByRole(
        'heading',
        { name: 'Environment Variables' },
        { timeout: COLD_START_TIMEOUT_MS },
      );
      const section = within(defined(heading.closest('section')));
      const names = () => section.getAllByRole<HTMLInputElement>('textbox', { name: 'Name' });
      const values = () => section.getAllByRole<HTMLInputElement>('textbox', { name: 'Value' });
      await waitFor(() => expect(names()[0]).toBeEnabled());
      expect(names().map((input) => input.value)).toEqual(['MODE', 'OLD', 'POD_IP']);
      expect(section.getByRole('textbox', { name: 'Value source' })).toHaveValue('FieldRef');
      expect(values()[2]).toHaveValue('status.podIP');
      expect(values()[2]).toBeDisabled();

      await user.clear(defined(values()[0]));
      await user.type(defined(values()[0]), 'staging');
      await user.click(defined(section.getAllByRole('button', { name: 'Delete' })[1]));
      expect(names().map((input) => input.value)).toEqual(['MODE', 'POD_IP']);

      await user.click(section.getByRole('button', { name: 'Add value' }));
      await user.type(defined(names().at(-1)), 'FEATURE');
      await user.type(defined(values().at(-1)), 'on');

      const addRef = section.getByRole('button', { name: 'Add from ConfigMap or Secret' });
      await user.click(addRef);
      await user.type(defined(names().at(-1)), 'LOG_LEVEL');
      expect(section.getByRole('button', { name: 'Select a key' })).toBeDisabled();
      await user.click(section.getByRole('button', { name: 'Select a resource' }));
      await user.click(await screen.findByRole('option', { name: 'web-config' }));
      // The cleared key isn't validated yet: only the toggle says "Select a key", no error.
      expect(section.getAllByText('Select a key')).toHaveLength(1);
      await user.click(section.getByRole('button', { name: 'Select a key' }));
      await user.click(await screen.findByRole('option', { name: 'LOG_LEVEL' }));

      await user.click(addRef);
      await user.type(defined(names().at(-1)), 'DB_PASSWORD');
      await user.click(section.getByRole('button', { name: 'Select a resource' }));
      await user.type(screen.getByRole('textbox', { name: 'ConfigMap or Secret' }), 'db');
      expect(screen.queryByRole('option', { name: 'web-config' })).not.toBeInTheDocument();
      await user.click(await screen.findByRole('option', { name: 'db-credentials' }));
      await user.click(section.getByRole('button', { name: 'Select a key' }));
      expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
        'password',
        'username',
      ]);
      await user.click(screen.getByRole('option', { name: 'password' }));
      // Only key names: the Secret's values are never shown nor put in the form.
      expect(screen.queryByText(/fake-password-not-real/)).not.toBeInTheDocument();

      const [web, ...others] = before.spec?.template.spec?.containers ?? [];
      const expected = {
        ...web,
        env: [
          { name: 'MODE', value: 'staging' },
          POD_IP,
          { name: 'FEATURE', value: 'on' },
          { name: 'LOG_LEVEL', valueFrom: { configMapKeyRef: { name: 'web-config', key: 'LOG_LEVEL' } } },
          { name: 'DB_PASSWORD', valueFrom: { secretKeyRef: { name: 'db-credentials', key: 'password' } } },
        ],
        envFrom: ENV_FROM,
      };
      await user.click(screen.getByRole('radio', { name: 'YAML view' }));
      expect(editorText()).not.toMatch(/fake-password-not-real|ZmFrZS1wYXNzd29yZC1ub3QtcmVhbA/);
      expect((parse(editorText()) as DeploymentObject).spec?.template.spec?.containers).toEqual([
        expected,
        ...others,
      ]);
      await user.click(screen.getByRole('button', { name: 'Save' }));

      await waitFor(() => expect(router.state.location.pathname).toBe(DETAILS));
      expect(puts).toHaveLength(1);
      expect(puts[0]?.spec?.template.spec?.containers).toEqual([expected, ...others]);
    },
  );
  it(
    'FORM-IMG: advanced image options are collapsed; a picked pull secret is saved into imagePullSecrets',
    { timeout: COLD_START_TEST_TIMEOUT_MS },
    async () => {
      const before = stored();
      const puts = recordPuts();
      const { user, router } = renderApp(FORM);
      const toggle = await screen.findByRole(
        'button',
        { name: 'Show advanced image options' },
        { timeout: COLD_START_TIMEOUT_MS },
      );
      const helper = 'Secret for authentication when pulling image from a secured registry.';
      expect(screen.getByText(helper)).not.toBeVisible();
      await user.click(toggle);
      expect(screen.getByRole('button', { name: 'Hide advanced image options' })).toBeInTheDocument();
      expect(
        screen.getByText('Secret for authentication when pulling image from a secured registry.'),
      ).toBeVisible();
      // Only image pull secret types are offered: the Opaque db-credentials is not.
      const pullSecret = await screen.findByRole('button', { name: 'Pull Secret' });
      await waitFor(() => expect(pullSecret).toHaveTextContent('Select Secret name'));
      await user.click(pullSecret);
      expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['registry-pull']);
      await user.click(screen.getByRole('option', { name: 'registry-pull' }));
      expect(pullSecret).toHaveTextContent('registry-pull');

      await user.click(screen.getByRole('button', { name: 'Save' }));
      await waitFor(() => expect(router.state.location.pathname).toBe(DETAILS));
      expect(puts).toHaveLength(1);
      expect(puts[0]?.spec?.template.spec).toEqual({
        ...before.spec?.template.spec,
        imagePullSecrets: [{ name: 'registry-pull' }],
      });
    },
  );
});
