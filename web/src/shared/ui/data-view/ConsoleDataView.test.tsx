import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ConsoleDataView, type ConsoleDataViewProps } from './ConsoleDataView';
import { DataViewTextFilter } from './DataViewTextFilter';
import type { DataViewColumn } from './types';

interface Row {
  name: string;
  owner: string;
}

const COLUMNS: DataViewColumn<Row>[] = [
  { id: 'name', title: 'Name', type: 'name', cell: (row) => row.name, sortValue: (row) => row.name },
  { id: 'owner', title: 'Owner', cell: (row) => row.owner },
];
const ROWS: Row[] = [
  { name: 'a', owner: 'alice' },
  { name: 'b', owner: 'bob' },
];
const FILTERS = [<DataViewTextFilter key="name" filterId="name" title="Name" placeholder="Filter by name" />];

function renderView(props: Partial<ConsoleDataViewProps<Row>> = {}) {
  return render(
    <ConsoleDataView<Row>
      id="things"
      label="Things"
      data={ROWS}
      filteredData={ROWS}
      loaded
      columns={COLUMNS}
      getRowId={(row) => row.name}
      filterNodes={FILTERS}
      filterValues={{ name: '' }}
      onFilterChange={vi.fn()}
      onClearAllFilters={vi.fn()}
      isFiltered={false}
      {...props}
    />,
  );
}

/** Header texts without the resizable columns' screen-reader width text. */
function headers(): string[] {
  return within(screen.getByRole('grid', { name: 'Things' }))
    .getAllByRole('columnheader')
    .map((header) => header.textContent.replace(/Column \d+ pixels$/, ''));
}

describe('ConsoleDataView (OCP ConsoleDataView)', () => {
  it('hides a column via Manage columns and keeps the choice after a remount', async () => {
    const user = userEvent.setup();
    const { unmount } = renderView();
    expect(headers()).toContain('Owner');

    await user.click(screen.getByRole('button', { name: 'Column management' }));
    const dialog = await screen.findByRole('dialog', { name: 'Manage columns' });
    expect(within(dialog).getByRole('checkbox', { name: 'Name' })).toBeDisabled();
    await user.click(within(dialog).getByRole('checkbox', { name: 'Owner' }));
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(headers()).not.toContain('Owner');

    unmount();
    renderView();
    expect(headers()).not.toContain('Owner');
    expect(screen.getByText('a')).toBeInTheDocument();
  });

  it.each([
    ['invalid JSON', '{not json'],
    ['the wrong shape', '["owner"]'],
    ['non-string ids', '{"shown":[1],"hidden":[]}'],
  ])('falls back to the default columns when the saved choice is %s', (_case, raw) => {
    localStorage.setItem('fleetconsole.dataView.columns.things', raw);
    localStorage.setItem('fleetconsole.dataView.columnWidths.things', raw);
    renderView();
    expect(headers()).toEqual(['Name', 'Owner']);
  });

  it('keeps a hidden choice for a column that is not listed at the moment', async () => {
    const user = userEvent.setup();
    const { unmount } = renderView({ columns: COLUMNS.slice(0, 1) });
    await user.click(screen.getByRole('button', { name: 'Column management' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Save' }));
    unmount();

    renderView();
    expect(headers()).toContain('Owner');
  });

  it('shows a full-page empty state when there is nothing to list', () => {
    renderView({ data: [], filteredData: [] });
    expect(screen.getByRole('heading', { name: 'No Things found' })).toBeInTheDocument();
    expect(screen.queryByRole('grid')).toBeNull();
  });

  it('shows a "No <plural> found" row when filters match nothing', () => {
    renderView({ filteredData: [], isFiltered: true, filterValues: { name: 'zzz' } });
    expect(within(screen.getByRole('grid', { name: 'Things' })).getByText('No Things found')).toBeInTheDocument();
  });

  it('shows the error instead of the list', () => {
    renderView({ error: <p>Boom</p> });
    expect(screen.getByText('Boom')).toBeInTheDocument();
    expect(screen.queryByRole('grid')).toBeNull();
  });
});
