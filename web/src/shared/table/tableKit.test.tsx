import { Button, MenuToggle, Select, SelectList, SelectOption, ToolbarFilter } from '@patternfly/react-core';
import { SearchIcon } from '@patternfly/react-icons';
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import { act, render, renderHook, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type ReactNode } from 'react';
import { createMemoryRouter, MemoryRouter, RouterProvider } from 'react-router';
import {
  FilterToolbar,
  matchesText,
  TableEmptyRow,
  TableSkeletonRows,
  useClientSort,
  useUrlFilters,
  type FilterDefs,
} from '.';
import { mockViewportWidth } from '@/test/viewport';

interface DemoCluster {
  name: string;
  environment: string;
  status: 'enabled' | 'disabled';
  lastSeen: number | null;
}

const ROWS: DemoCluster[] = [
  { name: 'prod-eu-1', environment: 'production', status: 'enabled', lastSeen: 30 },
  { name: 'stage-1', environment: 'staging', status: 'disabled', lastSeen: null },
  { name: 'dev-10', environment: 'development', status: 'enabled', lastSeen: 10 },
  { name: 'dev-2', environment: 'development', status: 'enabled', lastSeen: 20 },
];

const ENVIRONMENTS = [
  { value: 'production', label: 'Production' },
  { value: 'staging', label: 'Staging' },
  { value: 'development', label: 'Development' },
];

const FILTERS = {
  q: { kind: 'text' },
  env: { kind: 'multi', values: ENVIRONMENTS.map((e) => e.value) },
  status: { kind: 'single', values: ['enabled', 'disabled'] },
} as const satisfies FilterDefs;

const ACCESSORS = {
  name: (c: DemoCluster) => c.name,
  lastSeen: (c: DemoCluster) => c.lastSeen,
};

const STATUS_LABELS: Record<string, string> = { enabled: 'Enabled', disabled: 'Disabled' };

/**
 * A page-supplied single-select filter passed through `filterItems` (what the users page does for read-only and
 * the audit page for category): its label lives in the same toolbar, so "Clear all filters" covers it.
 */
function StatusFilter({ value, onChange }: { value: string | undefined; onChange: (v?: string) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <ToolbarFilter
      categoryName="Status"
      labels={value ? [{ key: value, node: STATUS_LABELS[value] }] : []}
      deleteLabel={() => onChange(undefined)}
      deleteLabelGroup={() => onChange(undefined)}
    >
      <Select
        isOpen={isOpen}
        selected={value}
        onSelect={(_event, v) => {
          onChange(String(v));
          setIsOpen(false);
        }}
        onOpenChange={setIsOpen}
        toggle={(toggleRef) => (
          <MenuToggle
            ref={toggleRef}
            aria-label="Filter by Status"
            isExpanded={isOpen}
            onClick={() => setIsOpen((open) => !open)}
          >
            Status
          </MenuToggle>
        )}
      >
        <SelectList>
          {Object.entries(STATUS_LABELS).map(([key, label]) => (
            <SelectOption key={key} value={key}>
              {label}
            </SelectOption>
          ))}
        </SelectList>
      </Select>
    </ToolbarFilter>
  );
}

/** A minimal admin list page built only from the kit, the way feature pages will use it. */
function DemoList({ rows }: { rows?: DemoCluster[] }) {
  const { values, setText, toggle, setSingle, clear, clearAll, activeCount } = useUrlFilters(FILTERS);
  const visible = (rows ?? []).filter(
    (c) =>
      matchesText(values.q ?? '', c.name) &&
      (values.env.length === 0 || values.env.includes(c.environment)) &&
      (values.status === undefined || values.status === c.status),
  );
  const { sorted, sortProps } = useClientSort(visible, ACCESSORS, { by: 'name', direction: 'asc' });

  return (
    <>
      <FilterToolbar
        ariaLabel="Clusters toolbar"
        search={{
          value: values.q ?? '',
          onChange: (v) => setText('q', v),
          placeholder: 'Filter by name',
          ariaLabel: 'Search clusters',
        }}
        filters={[
          {
            key: 'env',
            label: 'Environment',
            options: ENVIRONMENTS,
            selected: values.env,
            onToggle: (v) => toggle('env', v),
            onClear: () => clear('env'),
          },
        ]}
        filterItems={<StatusFilter value={values.status} onChange={(v) => setSingle('status', v)} />}
        onClearAll={clearAll}
        actions={<Button>Register cluster</Button>}
      />
      <p>Active filters: {activeCount}</p>
      <Table aria-label="Clusters">
        <Thead>
          <Tr>
            <Th sort={sortProps('name', 0)}>Name</Th>
            <Th sort={sortProps('lastSeen', 1)}>Last seen</Th>
          </Tr>
        </Thead>
        <Tbody>
          {rows === undefined && <TableSkeletonRows columns={2} rows={3} />}
          {rows !== undefined && sorted.length === 0 && (
            <TableEmptyRow
              colSpan={2}
              icon={SearchIcon}
              title="No clusters match"
              body="Adjust or clear the filters."
              actions={
                <Button variant="link" onClick={clearAll}>
                  Clear filters
                </Button>
              }
            />
          )}
          {sorted.map((c) => (
            <Tr key={c.name}>
              <Td dataLabel="Name">{c.name}</Td>
              <Td dataLabel="Last seen">{c.lastSeen ?? 'never'}</Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
    </>
  );
}

function renderDemo(url = '/admin/clusters', { loading = false } = {}) {
  const element = <DemoList rows={loading ? undefined : ROWS} />;
  const router = createMemoryRouter([{ path: '/admin/clusters', element }], {
    initialEntries: [url],
  });
  const result = render(<RouterProvider router={router} />);
  return { ...result, router, user: userEvent.setup() };
}

/** Names in the first column, in display order. */
function visibleNames() {
  const body = screen.getAllByRole('rowgroup')[1];
  if (!body) throw new Error('table body not rendered');
  return within(body)
    .getAllByRole('row')
    .map((row) => within(row).getAllByRole('cell')[0]?.textContent);
}

/** The filter labels of one category (PatternFly renders them as a list labelled by the category name). */
function filterLabels(category: string) {
  return screen.getByRole('list', { name: category });
}

describe('admin list kit (demo list)', () => {
  // Filter labels collapse below PF's xl breakpoint; jsdom is narrower (see mockViewportWidth).
  beforeEach(() => mockViewportWidth(1440));

  it('names the toolbar, search box, filter toggle and actions', () => {
    renderDemo();

    expect(screen.getByRole('group', { name: 'Clusters toolbar' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Search clusters' })).toHaveAttribute(
      'placeholder',
      'Filter by name',
    );
    expect(screen.getByRole('button', { name: 'Filter by Environment' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Register cluster' })).toBeInTheDocument();
  });

  it('filters while typing and writes ?q= without adding history entries', async () => {
    const { user, router } = renderDemo('/admin/clusters?keep=1');

    await user.type(screen.getByRole('textbox', { name: 'Search clusters' }), 'DEV');

    expect(visibleNames()).toEqual(['dev-2', 'dev-10']);
    expect(router.state.location.search).toBe('?keep=1&q=DEV');
    expect(router.state.historyAction).toBe('REPLACE');

    await user.clear(screen.getByRole('textbox', { name: 'Search clusters' }));
    expect(router.state.location.search).toBe('?keep=1');
    expect(visibleNames()).toHaveLength(4);
  });

  it('writes checkbox filters as repeated params and shows removable labels', async () => {
    const { user, router } = renderDemo();

    await user.click(screen.getByRole('button', { name: 'Filter by Environment' }));
    await user.click(screen.getByRole('checkbox', { name: 'Production' }));
    await user.click(screen.getByRole('checkbox', { name: 'Staging' }));

    expect(router.state.location.search).toBe('?env=production&env=staging');
    expect(visibleNames()).toEqual(['prod-eu-1', 'stage-1']);
    expect(screen.getByText('Active filters: 2')).toBeInTheDocument();

    const labels = filterLabels('Environment');
    expect(within(labels).getByText('Production')).toBeInTheDocument();
    await user.click(within(labels).getByRole('button', { name: 'Close Production' }));

    expect(router.state.location.search).toBe('?env=staging');
    expect(visibleNames()).toEqual(['stage-1']);
  });

  it('removes a whole filter category via its label group', async () => {
    const { user, router } = renderDemo('/admin/clusters?env=production&env=staging&q=e');

    await user.click(screen.getByRole('button', { name: /close label group/i }));

    expect(router.state.location.search).toBe('?q=e');
  });

  it('shows a filter count instead of labels on narrow screens', () => {
    mockViewportWidth(1024);
    renderDemo('/admin/clusters?env=production&env=staging');

    expect(screen.getByText('2 filters applied')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Environment' })).not.toBeInTheDocument();
  });

  it('labels a page-supplied filterItems filter and clears it with "Clear all filters"', async () => {
    const { user, router } = renderDemo('/admin/clusters?keep=1');

    await user.click(screen.getByRole('button', { name: 'Filter by Status' }));
    await user.click(screen.getByRole('option', { name: 'Disabled' }));

    expect(router.state.location.search).toBe('?keep=1&status=disabled');
    expect(visibleNames()).toEqual(['stage-1']);
    expect(within(filterLabels('Status')).getByText('Disabled')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Clear all filters' }));

    expect(router.state.location.search).toBe('?keep=1');
    expect(screen.queryByRole('list', { name: 'Status' })).not.toBeInTheDocument();
    expect(visibleNames()).toHaveLength(4);
  });

  it('"Clear all filters" resets every declared filter and keeps other params', async () => {
    const { user, router } = renderDemo('/admin/clusters?q=prod&env=production&keep=1');

    await user.click(screen.getByRole('button', { name: 'Clear all filters' }));

    expect(router.state.location.search).toBe('?keep=1');
    expect(screen.getByRole('textbox', { name: 'Search clusters' })).toHaveValue('');
    expect(visibleNames()).toHaveLength(4);
  });

  it('restores filters from the URL on mount (reload)', async () => {
    const first = renderDemo();
    await first.user.type(screen.getByRole('textbox', { name: 'Search clusters' }), 'e');
    await first.user.click(screen.getByRole('button', { name: 'Filter by Environment' }));
    await first.user.click(screen.getByRole('checkbox', { name: 'Staging' }));
    const url = first.router.state.location.pathname + first.router.state.location.search;
    first.unmount();

    const { user } = renderDemo(url);

    expect(screen.getByRole('textbox', { name: 'Search clusters' })).toHaveValue('e');
    expect(visibleNames()).toEqual(['stage-1']);
    expect(within(filterLabels('Environment')).getByText('Staging')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Filter by Environment' }));
    expect(screen.getByRole('checkbox', { name: 'Staging' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Production' })).not.toBeChecked();
  });

  it('ignores unknown URL values and drops them on the next write', async () => {
    const { user, router } = renderDemo('/admin/clusters?env=bogus&env=staging&status=weird&keep=1');

    expect(visibleNames()).toEqual(['stage-1']);
    expect(screen.getByText('Active filters: 1')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Filter by Environment' }));
    await user.click(screen.getByRole('checkbox', { name: 'Production' }));

    expect(router.state.location.search).toBe('?status=weird&keep=1&env=staging&env=production');
  });

  it('shows the no-match row with "Clear filters"', async () => {
    const { user, router } = renderDemo('/admin/clusters?q=nothing-matches');

    expect(screen.getByRole('heading', { name: 'No clusters match' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));

    expect(router.state.location.search).toBe('');
    expect(visibleNames()).toHaveLength(4);
  });

  it('renders skeleton rows while loading, announced once', () => {
    renderDemo('/admin/clusters', { loading: true });

    expect(screen.getAllByRole('row')).toHaveLength(4); // header + 3 skeleton rows
    expect(screen.getAllByText('Loading')).toHaveLength(1);
  });

  it('sorts by column, toggles direction and keeps nulls last', async () => {
    const { user } = renderDemo();
    const header = (name: string) => screen.getByRole('columnheader', { name });

    expect(visibleNames()).toEqual(['dev-2', 'dev-10', 'prod-eu-1', 'stage-1']);
    expect(header('Name')).toHaveAttribute('aria-sort', 'ascending');

    await user.click(within(header('Name')).getByRole('button'));
    expect(visibleNames()).toEqual(['stage-1', 'prod-eu-1', 'dev-10', 'dev-2']);
    expect(header('Name')).toHaveAttribute('aria-sort', 'descending');

    await user.click(within(header('Last seen')).getByRole('button'));
    expect(visibleNames()).toEqual(['dev-10', 'dev-2', 'prod-eu-1', 'stage-1']);
    expect(header('Name')).not.toHaveAttribute('aria-sort');

    await user.click(within(header('Last seen')).getByRole('button'));
    expect(visibleNames()).toEqual(['prod-eu-1', 'dev-2', 'dev-10', 'stage-1']);
  });
});

describe('useUrlFilters', () => {
  const wrapper =
    (url: string) =>
    ({ children }: { children: ReactNode }) => <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>;

  it('reads single filters, ignoring unknown values', () => {
    const { result } = renderHook(() => useUrlFilters(FILTERS), {
      wrapper: wrapper('/?status=weird&status=disabled'),
    });

    expect(result.current.values.status).toBe('disabled');
    expect(result.current.values.env).toEqual([]);
    expect(result.current.values.q).toBeUndefined();
    expect(result.current.activeCount).toBe(1);
  });

  it('sets and clears single filters; rejects undeclared values', () => {
    const { result } = renderHook(() => useUrlFilters(FILTERS), { wrapper: wrapper('/') });

    act(() => result.current.setSingle('status', 'enabled'));
    expect(result.current.values.status).toBe('enabled');

    act(() => result.current.setSingle('status', 'nope'));
    expect(result.current.values.status).toBe('enabled');

    act(() => result.current.setSingle('status'));
    expect(result.current.values.status).toBeUndefined();
    expect(result.current.activeCount).toBe(0);
  });

  it('dedupes repeated multi values', () => {
    const { result } = renderHook(() => useUrlFilters(FILTERS), {
      wrapper: wrapper('/?env=staging&env=staging'),
    });

    expect(result.current.values.env).toEqual(['staging']);
  });
});

describe('matchesText', () => {
  it('matches case-insensitive substrings of any field and skips missing fields', () => {
    expect(matchesText('ALI', 'bob', null, 'Alice')).toBe(true);
    expect(matchesText('carol', 'bob', undefined)).toBe(false);
    expect(matchesText('  ', 'anything')).toBe(true);
    expect(matchesText('', null)).toBe(true);
  });
});
