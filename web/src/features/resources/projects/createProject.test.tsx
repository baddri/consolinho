import { screen, waitFor, within } from '@testing-library/react';
import { NamespaceModel, ProjectModel, setWatchTimingForTests } from '@/shared/k8s';
import { COLD_START_TEST_TIMEOUT_MS, COLD_START_TIMEOUT_MS, preloadLazyRoutes } from '@/test/coldStart';
import { mockK8s, setMockUser } from '@/test/handlers';
import { renderApp, renderWithProviders } from '@/test/render';
import { resourceRoutes } from '../routes';
import { CreateProjectButton } from './CreateProjectButton';
import { PROJECT_NAME_HELP, PROJECT_NAME_PREFIX_HELP } from './createProjectSchema';

const PROJECTS = '/c/dev-1/k8s/cluster/projects';

beforeAll(() => preloadLazyRoutes(resourceRoutes));
beforeEach(() => {
  onTestFinished(
    setWatchTimingForTests({ flushMs: 10, initialBackoffMs: 20, maxBackoffMs: 40, minStreamMs: 100 }),
  );
});

/** Opens the Create Project modal from the Projects list once the button is enabled. */
async function openModal() {
  const rendered = renderApp(PROJECTS);
  const button = await screen.findByRole(
    'button',
    { name: 'Create Project' },
    { timeout: COLD_START_TIMEOUT_MS },
  );
  await waitFor(() => expect(button).not.toHaveAttribute('aria-disabled', 'true'));
  await rendered.user.click(button);
  const dialog = await screen.findByRole('dialog', { name: 'Create Project' });
  return { ...rendered, dialog };
}

describe('Create Project (T-0309, PRJ-2)', () => {
  it(
    'RW creates team-new and lands on its details; the toast names project and cluster',
    async () => {
      const { user, dialog, router } = await openModal();
      const name = within(dialog).getByRole('textbox', { name: 'Name' });
      await waitFor(() => expect(name).toHaveFocus());
      expect(dialog).toHaveTextContent(
        'An OpenShift project is an alternative representation of a Kubernetes namespace.',
      );
      // OCP: the Name rules are in the label's Help popover, not helper text under the field.
      expect(dialog).not.toHaveTextContent(PROJECT_NAME_HELP);
      await user.type(name, 'team-new');
      await user.type(within(dialog).getByRole('textbox', { name: 'Display name' }), 'Team New');
      await user.type(within(dialog).getByRole('textbox', { name: 'Description' }), 'New team apps');
      await waitFor(() => expect(dialog).toHaveTextContent('Project team-new on Development 1'));
      await user.click(within(dialog).getByRole('button', { name: 'Create' }));

      await waitFor(() => expect(router.state.location.pathname).toBe(`${PROJECTS}/team-new`));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(await screen.findByText('Project team-new created on Development 1')).toBeInTheDocument();
      expect(mockK8s.get('dev-1', ProjectModel, undefined, 'team-new')?.metadata.annotations).toMatchObject({
        'openshift.io/display-name': 'Team New',
        'openshift.io/description': 'New team apps',
      });
    },
    COLD_START_TEST_TIMEOUT_MS,
  );

  it(
    "the Name label Help popover shows OCP's two rules",
    async () => {
      const { user, dialog } = await openModal();
      await user.click(within(dialog).getByRole('button', { name: 'Help' }));
      const help = await screen.findByRole('dialog', { name: 'Help' });
      expect(help).toHaveTextContent(PROJECT_NAME_HELP);
      expect(help).toHaveTextContent(PROJECT_NAME_PREFIX_HELP);
    },
    COLD_START_TEST_TIMEOUT_MS,
  );

  it(
    'a taken name (409) shows the server message inline and keeps the modal open',
    async () => {
      const { user, dialog } = await openModal();
      await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'shop');
      await user.click(within(dialog).getByRole('button', { name: 'Create' }));

      expect(await within(dialog).findByText('An error occurred')).toBeInTheDocument();
      expect(
        within(dialog).getByText('project.project.openshift.io "shop" already exists'),
      ).toBeInTheDocument();
      expect(screen.getByRole('dialog', { name: 'Create Project' })).toBeInTheDocument();
    },
    COLD_START_TEST_TIMEOUT_MS,
  );

  it(
    'an invalid name blocks Create with a field error',
    async () => {
      const { user, dialog } = await openModal();
      await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'Bad_Name');
      await user.click(within(dialog).getByRole('button', { name: 'Create' }));

      expect(
        await within(dialog).findByText(
          "Use lowercase letters, digits and '-' (max 63), starting and ending with a letter or digit.",
        ),
      ).toBeInTheDocument();
      expect(mockK8s.get('dev-1', NamespaceModel, undefined, 'Bad_Name')).toBeUndefined();
      expect(screen.getByRole('dialog', { name: 'Create Project' })).toBeInTheDocument();
    },
    COLD_START_TEST_TIMEOUT_MS,
  );

  it('SAFE5-2: a read-only grant keeps the button visible, disabled with the reason', async () => {
    setMockUser('alice');
    const { user } = renderWithProviders(<CreateProjectButton cluster="prod-eu-1" />);

    // The tooltip appears once the grant's access mode is known; hover again until then.
    await waitFor(async () => {
      await user.hover(screen.getByRole('button', { name: 'Create Project' }));
      expect(screen.getByRole('tooltip')).toHaveTextContent('Your access to prod-eu-1 is read-only.');
    });
    const button = screen.getByRole('button', { name: 'Create Project' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    await user.click(button);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('Project and Namespace details tabs (PRJ-1)', () => {
  const tabNames = () => screen.getAllByRole('tab').map((tab) => tab.textContent);

  it.each([
    ['Project', `${PROJECTS}/shop`],
    ['Namespace', '/c/dev-1/k8s/cluster/namespaces/shop'],
  ])(
    '%s details have no Events tab',
    async (_kind, path) => {
      renderApp(path);
      await screen.findByRole('tabpanel', { name: 'Details' }, { timeout: COLD_START_TIMEOUT_MS });
      expect(tabNames()).toEqual(['Details', 'YAML']);
    },
    COLD_START_TEST_TIMEOUT_MS,
  );
});
