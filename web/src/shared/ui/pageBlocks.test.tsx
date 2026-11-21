import { Button } from '@patternfly/react-core';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, MemoryRouter, RouterProvider } from 'react-router';
import {
  DetailsColumn,
  DetailsGrid,
  DetailsItem,
  PageBody,
  PageHeading,
  PageTabs,
  SectionHeading,
  StatusIconText,
} from '.';

describe('PageHeading', () => {
  it('renders breadcrumb links, the current crumb, one h1, status, labels, actions, subtitle and alert', () => {
    render(
      <MemoryRouter>
        <PageHeading
          title="alice"
          breadcrumbs={[{ label: 'Users', to: '/admin/users' }, { label: 'User details' }]}
          icon={<span>U</span>}
          status={<StatusIconText status="success" text="Active" asLabel />}
          labels={<span>Read only</span>}
          subtitle="Grants and credentials of this user."
          actions={<Button>Actions</Button>}
          alert={<div role="alert">Heads up</div>}
        />
      </MemoryRouter>,
    );

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: 'alice' })).toBeInTheDocument();
    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(crumbs).getByRole('link', { name: 'Users' })).toHaveAttribute('href', '/admin/users');
    expect(within(crumbs).getByText('User details')).toHaveAttribute('aria-current', 'page');
    expect(within(crumbs).queryByRole('link', { name: 'User details' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Actions' })).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeVisible();
    expect(screen.getByText('Read only')).toBeInTheDocument();
    expect(screen.getByText('Grants and credentials of this user.')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Heads up');
  });

  it('omits the breadcrumb on list pages', () => {
    render(
      <MemoryRouter>
        <PageHeading title="Users" actions={<Button>Add user</Button>} />
      </MemoryRouter>,
    );
    expect(screen.queryByRole('navigation', { name: 'Breadcrumb' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add user' })).toBeInTheDocument();
  });
});

describe('PageTabs', () => {
  const tabs = [
    { key: 'details', title: 'Details', to: '/admin/users/alice' },
    { key: 'grants', title: 'Grants', to: '/admin/users/alice/grants' },
  ];

  /** Memory data router at the details tab; its state exposes the location key and last history action. */
  function renderTabs() {
    const router = createMemoryRouter(
      [
        {
          path: '/admin/users/alice',
          element: <PageTabs tabs={tabs} activeKey="details" aria-label="User tabs" />,
        },
        {
          path: '/admin/users/alice/grants',
          element: <PageTabs tabs={tabs} activeKey="grants" aria-label="User tabs" />,
        },
      ],
      { initialEntries: ['/admin/users/alice'] },
    );
    render(<RouterProvider router={router} />);
    return router;
  }

  it('renders link tabs inside a labelled nav with aria-current on the active one', () => {
    renderTabs();
    const nav = screen.getByRole('navigation', { name: 'User tabs' });
    expect(within(nav).getByRole('tab', { name: 'Details' })).toHaveAttribute('aria-current', 'page');
    const grants = within(nav).getByRole('tab', { name: 'Grants' });
    expect(grants).not.toHaveAttribute('aria-current');
    expect(grants).toHaveAttribute('href', '/admin/users/alice/grants');
  });

  it('pushes the tab route through the router, so Back returns to the previous tab', async () => {
    const user = userEvent.setup();
    const router = renderTabs();

    await user.click(screen.getByRole('tab', { name: 'Grants' }));

    expect(router.state.location.pathname).toBe('/admin/users/alice/grants');
    expect(router.state.historyAction).toBe('PUSH');
    expect(screen.getByRole('tab', { name: 'Grants' })).toHaveAttribute('aria-current', 'page');

    await act(() => router.navigate(-1));
    expect(router.state.location.pathname).toBe('/admin/users/alice');
    expect(screen.getByRole('tab', { name: 'Details' })).toHaveAttribute('aria-current', 'page');
  });

  it('adds no history entry when the active tab is clicked', async () => {
    const user = userEvent.setup();
    const router = renderTabs();
    const { key } = router.state.location;
    const browserHistoryLength = window.history.length;

    await user.click(screen.getByRole('tab', { name: 'Details' }));

    expect(router.state.location.key).toBe(key);
    expect(router.state.historyAction).toBe('POP');
    expect(window.history.length).toBe(browserHistoryLength);
  });
});

describe('PageBody / SectionHeading / DetailsGrid', () => {
  it('renders a section heading and vertical term/value pairs in two columns', () => {
    render(
      <PageBody>
        <SectionHeading text="User details" id="user-details" />
        <DetailsGrid>
          <DetailsColumn>
            <DetailsItem label="Name" data-testid="name-item">
              alice
            </DetailsItem>
          </DetailsColumn>
          <DetailsColumn>
            <DetailsItem label="Role">Admin</DetailsItem>
          </DetailsColumn>
        </DetailsGrid>
      </PageBody>,
    );

    expect(screen.getByRole('heading', { level: 2, name: 'User details' })).toHaveAttribute(
      'id',
      'user-details',
    );
    expect(screen.getByTestId('name-item')).toHaveTextContent('Namealice');
    const lists = screen.getAllByRole('term').map((term) => term.closest('dl'));
    expect(new Set(lists).size).toBe(2);
    lists.forEach((list) => expect(list).not.toHaveClass('pf-m-horizontal'));
  });
});

describe('StatusIconText', () => {
  it('shows the text and hides the status icon from assistive technology', () => {
    const { container } = render(<StatusIconText status="danger" text="Failed" />);
    expect(screen.getByText('Failed')).toBeVisible();
    const icon = container.querySelector('svg');
    expect(icon?.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(container.querySelector('.pf-m-danger')).not.toBeNull();
  });

  it('renders no icon for neutral statuses', () => {
    const { container } = render(<StatusIconText status="neutral" text="Unknown" />);
    expect(screen.getByText('Unknown')).toBeVisible();
    expect(container.querySelector('svg')).toBeNull();
  });

  it('renders an outlined compact label with asLabel', () => {
    const { container } = render(<StatusIconText status="success" text="Active" asLabel />);
    const label = container.querySelector('.pf-v6-c-label');
    expect(label).toHaveClass('pf-m-outline', 'pf-m-compact');
    expect(label).toHaveTextContent('Active');
    expect(label?.querySelector('svg')?.closest('[aria-hidden="true"]')).not.toBeNull();
  });
});
