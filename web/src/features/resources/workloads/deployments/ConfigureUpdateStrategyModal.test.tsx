import { screen, waitFor, within } from '@testing-library/react';
import { DeploymentModel, setWatchTimingForTests, type Deployment, type K8sResource } from '@/shared/k8s';
import { COLD_START_TEST_TIMEOUT_MS, COLD_START_TIMEOUT_MS, preloadLazyRoutes } from '@/test/coldStart';
import { mockK8s } from '@/test/handlers';
import { renderApp, renderWithProviders } from '@/test/render';
import { server } from '@/test/server';
import { resourceRoutes } from '../../routes';
import { ConfigureUpdateStrategyModal, toDeploymentStrategy } from './ConfigureUpdateStrategyModal';

const DETAILS = '/c/dev-1/k8s/ns/shop/deployments/web';

beforeAll(() => preloadLazyRoutes(resourceRoutes));

beforeEach(() => {
  onTestFinished(
    setWatchTimingForTests({ flushMs: 10, initialBackoffMs: 20, maxBackoffMs: 40, minStreamMs: 100 }),
  );
});

/** The `web` deployment of `dev-1` as the mock stores it (RollingUpdate, 25% / 25%, 3 replicas). */
function web(): Deployment & K8sResource {
  const stored = mockK8s.get('dev-1', DeploymentModel, 'shop', 'web');
  if (!stored) throw new Error('fixture deployment web missing');
  return stored as Deployment & K8sResource;
}

/** Records the JSON body of every PATCH the proxy receives. */
function recordPatchBodies(): unknown[] {
  const bodies: unknown[] = [];
  server.events.on('request:start', ({ request }) => {
    if (request.method === 'PATCH') void request.clone().json().then((body: unknown) => bodies.push(body));
  });
  return bodies;
}

/** `web` with `strategy` in place of its own. */
function withStrategy(strategy: NonNullable<Deployment['spec']>['strategy']): Deployment & K8sResource {
  const deployment = web();
  return { ...deployment, spec: { selector: {}, template: {}, ...deployment.spec, strategy } };
}

/** Renders the modal on its own for `deployment`. */
function renderModal(deployment: Deployment & K8sResource) {
  const onClose = vi.fn();
  const result = renderWithProviders(
    <ConfigureUpdateStrategyModal cluster="dev-1" deployment={deployment} onClose={onClose} />,
  );
  return { ...result, onClose, dialog: screen.getByRole('dialog', { name: 'Edit update strategy' }) };
}

describe('ConfigureUpdateStrategyModal (T-0183)', () => {
  it('DEP-8: is prefilled from spec.strategy with OCP copy, the checked radio focused', async () => {
    const { dialog } = renderModal(
      withStrategy({ type: 'RollingUpdate', rollingUpdate: { maxUnavailable: 1, maxSurge: '50%' } }),
    );

    expect(dialog).toHaveTextContent('How should the pods be replaced when a new revision is created?');
    const rolling = within(dialog).getByRole('radio', { name: 'RollingUpdate (default)' });
    expect(rolling).toBeChecked();
    await waitFor(() => expect(rolling).toHaveFocus());
    expect(within(dialog).getByRole('radio', { name: 'Recreate' })).not.toBeChecked();
    expect(within(dialog).getByRole('textbox', { name: 'Max unavailable' })).toHaveValue('1');
    expect(within(dialog).getByRole('textbox', { name: 'Max surge' })).toHaveValue('50%');
    expect(dialog).toHaveTextContent('of pods');
    expect(dialog).toHaveTextContent('greater than pods');
  });

  it('DEP-8: a Recreate deployment opens on Recreate with disabled bounds at the 25% default', () => {
    const { dialog } = renderModal(withStrategy({ type: 'Recreate' }));

    expect(within(dialog).getByRole('radio', { name: 'Recreate' })).toBeChecked();
    const maxUnavailable = within(dialog).getByRole('textbox', { name: 'Max unavailable' });
    expect(maxUnavailable).toBeDisabled();
    expect(maxUnavailable).toHaveValue('25%');
  });

  it(
    'DEP-8: switching to Recreate from the Actions menu sends one replace /spec/strategy without rollingUpdate',
    async () => {
      const bodies = recordPatchBodies();
      const { user } = renderApp(DETAILS);

      await user.click(
        await screen.findByRole('button', { name: 'Actions' }, { timeout: COLD_START_TIMEOUT_MS }),
      );
      const item = screen.getByRole('menuitem', { name: 'Edit update strategy' });
      await waitFor(() => expect(item).not.toHaveAttribute('aria-disabled', 'true'));
      await user.click(item);
      const dialog = await screen.findByRole('dialog', { name: 'Edit update strategy' });
      await waitFor(() => expect(dialog).toHaveTextContent('Deployment web in shop on Development 1'));
      expect(within(dialog).getByRole('textbox', { name: 'Max surge' })).toHaveValue('25%');

      await user.click(within(dialog).getByRole('radio', { name: 'Recreate' }));
      expect(within(dialog).getByRole('textbox', { name: 'Max surge' })).toBeDisabled();
      await user.click(within(dialog).getByRole('button', { name: 'Save' }));

      expect(await screen.findByText('Update strategy saved for web on Development 1')).toBeInTheDocument();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(bodies).toEqual([[{ op: 'replace', path: '/spec/strategy', value: { type: 'Recreate' } }]]);
      expect(web().spec?.strategy).toEqual({ type: 'Recreate' });
    },
    COLD_START_TEST_TIMEOUT_MS,
  );

  it('DEP-8: an invalid bound is a field error that blocks Save until fixed or Recreate is chosen', async () => {
    const bodies = recordPatchBodies();
    const { user, dialog, onClose } = renderModal(web());
    const maxSurge = within(dialog).getByRole('textbox', { name: 'Max surge' });
    const save = within(dialog).getByRole('button', { name: 'Save' });

    await user.clear(maxSurge);
    await user.type(maxSurge, '2x');
    expect(await within(dialog).findByText('Enter a whole number of pods or a percentage, e.g. 25%.')).toBeInTheDocument();
    expect(maxSurge).toHaveAttribute('aria-invalid', 'true');
    expect(save).toBeDisabled();
    await user.type(maxSurge, '{Enter}');

    await user.click(within(dialog).getByRole('radio', { name: 'Recreate' }));
    await waitFor(() => expect(save).toBeEnabled());
    await user.click(within(dialog).getByRole('radio', { name: 'RollingUpdate (default)' }));
    await waitFor(() => expect(save).toBeDisabled());

    await user.clear(maxSurge);
    await user.type(maxSurge, '1');
    await waitFor(() => expect(save).toBeEnabled());
    expect(bodies).toEqual([]);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('DEP-8: counts stay numbers, percentages stay strings and blank bounds save OCP’s 25%', () => {
    expect(toDeploymentStrategy({ type: 'RollingUpdate', maxUnavailable: '0', maxSurge: '' })).toEqual({
      type: 'RollingUpdate',
      rollingUpdate: { maxUnavailable: 0, maxSurge: '25%' },
    });
    expect(toDeploymentStrategy({ type: 'RollingUpdate', maxUnavailable: '10%', maxSurge: '2' })).toEqual({
      type: 'RollingUpdate',
      rollingUpdate: { maxUnavailable: '10%', maxSurge: 2 },
    });
    expect(toDeploymentStrategy({ type: 'Recreate', maxUnavailable: '1', maxSurge: '1' })).toEqual({
      type: 'Recreate',
    });
  });
});
