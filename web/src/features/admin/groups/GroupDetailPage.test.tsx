import { screen, within } from '@testing-library/react';
import { PRODUCT_NAME } from '@/shared/branding';
import { COLD_START_TEST_TIMEOUT_MS, COLD_START_TIMEOUT_MS, preloadLazyRoutes } from '@/test/coldStart';
import { setMockHostGroups } from '@/test/handlers';
import { renderApp } from '@/test/render';
import { adminRoute } from '../routes';

describe('GroupDetailPage (GPG-2)', () => {
  beforeAll(() => preloadLazyRoutes([adminRoute]));

  it('deep-links to a group with its details and members', { timeout: COLD_START_TEST_TIMEOUT_MS }, async () => {
    setMockHostGroups([{ name: 'sre', users: ['alice', 'bob', 'zoe'] }]);
    renderApp('/fleet/admin/groups/sre');

    const members = await screen.findByRole('grid', { name: 'Users of sre' }, { timeout: COLD_START_TIMEOUT_MS });
    expect(screen.getByRole('heading', { name: /sre/, level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Groups' })).toHaveAttribute('href', '/fleet/admin/groups');
    expect(screen.getByRole('tab', { name: 'Details' })).toHaveAttribute('aria-selected', 'true');
    const panel = screen.getByRole('tabpanel', { name: 'Details' });
    // Two sibling bordered sections (OCP's two `PaneBody`s), the members in the second.
    expect(within(panel).getByRole('region', { name: 'Group details' })).not.toContainElement(members);
    expect(within(panel).getByRole('region', { name: 'Users' })).toContainElement(members);
    expect(screen.getByText('Host cluster')).toBeInTheDocument();
    expect(within(members).getByRole('link', { name: 'alice' })).toHaveAttribute('href', '/fleet/admin/users/alice');
    expect(within(members).queryByRole('link', { name: 'zoe' })).not.toBeInTheDocument();
    const zoe = within(members).getByText('zoe').closest('tr');
    if (!zoe) throw new Error('no row for zoe');
    expect(within(zoe).getByText(`No ${PRODUCT_NAME} user`)).toBeInTheDocument();
  });

  it('labels a grant-only group and shows its members as unknown', async () => {
    const { user } = renderApp('/fleet/admin/groups/ghost-team');

    expect(await screen.findByRole('heading', { name: 'Members unknown' })).toBeInTheDocument();
    expect(screen.getByText('Not found on host cluster')).toBeInTheDocument();
    expect(screen.getByText('Grants only')).toBeInTheDocument();
    await user.hover(screen.getByText('-'));
    expect(await screen.findByRole('tooltip')).toHaveTextContent("The group doesn't exist on the host cluster.");
  });

  it('explains unknown members when the host groups cannot be read', async () => {
    setMockHostGroups('forbidden');
    const { user } = renderApp('/fleet/admin/groups/sre');

    expect(await screen.findByRole('heading', { name: 'Members unknown' })).toBeInTheDocument();
    // Users comes before Source (also `-`: unknown without the host listing).
    const [usersCount] = screen.getAllByText('-');
    if (!usersCount) throw new Error('no member count');
    await user.hover(usersCount);
    expect(await screen.findByRole('tooltip')).toHaveTextContent(/Member count unavailable/);
  });

  it('says "No users" for an empty host group', async () => {
    setMockHostGroups([{ name: 'empty', users: [] }]);
    renderApp('/fleet/admin/groups/empty');

    expect(await screen.findByRole('heading', { name: 'No users' })).toBeInTheDocument();
  });

  it('shows the not-found state for an unknown group', async () => {
    renderApp('/fleet/admin/groups/nope');

    expect(await screen.findByRole('heading', { name: 'Group nope not found' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to Groups' })).toHaveAttribute('href', '/fleet/admin/groups');
  });
});
