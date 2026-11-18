import {
  Badge,
  MenuToggle,
  SearchInput,
  Select,
  SelectList,
  SelectOption,
  Toolbar,
  ToolbarContent,
  ToolbarFilter,
  ToolbarGroup,
  ToolbarItem,
  ToolbarToggleGroup,
} from '@patternfly/react-core';
import { FilterIcon } from '@patternfly/react-icons';
import { useState, type ReactNode } from 'react';

/** One option of a checkbox filter. */
export interface FilterOption {
  /** Value stored in the URL. */
  value: string;
  /** Text shown in the menu and on the removable label. */
  label: string;
}

/** A checkbox filter ("Environment", "Status", …) rendered as a `Select` with a label group of its selections. */
export interface ToolbarCheckboxFilter {
  /** Stable identifier (usually the URL param name). */
  key: string;
  /** Category name shown on the toggle and the label group. */
  label: string;
  options: FilterOption[];
  /** Currently selected option values. */
  selected: string[];
  /** Selects or deselects one value. */
  onToggle: (value: string) => void;
  /** Removes every selection of this filter. */
  onClear: () => void;
}

/** The search box of a {@link FilterToolbar}. */
export interface ToolbarSearch {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  ariaLabel: string;
}

/** Props for {@link FilterToolbar}. */
export interface FilterToolbarProps {
  search?: ToolbarSearch;
  filters?: ToolbarCheckboxFilter[];
  /**
   * Extra PF `ToolbarFilter`/`ToolbarItem`s, e.g. single selects, typeaheads, date range. Rendered in the filter
   * group after the checkbox filters, so they share the toolbar's label collapse and "Clear all filters".
   */
  filterItems?: ReactNode;
  /** Enables PatternFly's "Clear all filters" button (shown while any filter label is present). */
  onClearAll?: () => void;
  /** Right-aligned content, e.g. the page's primary "Add user" button. */
  actions?: ReactNode;
  /** Accessible name of the toolbar, e.g. "Users toolbar". */
  ariaLabel: string;
}

/** Replaces PatternFly's default "1 filters applied" (shown instead of labels below `xl`). */
const filtersAppliedText = (count: number) => `${count} ${count === 1 ? 'filter' : 'filters'} applied`;

/**
 * Toolbar for admin list pages: search box, checkbox filters and page-supplied `filterItems` (collapsed behind a
 * filter toggle below the `xl` breakpoint), removable labels for every selected filter value (a "N filters applied"
 * count below `xl`), "Clear all filters", and right-aligned actions.
 * Purely presentational; pair it with `useUrlFilters` for URL-backed state.
 */
export function FilterToolbar({
  search,
  filters = [],
  filterItems,
  onClearAll,
  actions,
  ariaLabel,
}: FilterToolbarProps) {
  return (
    <Toolbar
      role="group"
      aria-label={ariaLabel}
      clearAllFilters={onClearAll}
      collapseListedFiltersBreakpoint="xl"
      numberOfFiltersText={filtersAppliedText}
    >
      <ToolbarContent>
        <ToolbarToggleGroup toggleIcon={<FilterIcon />} breakpoint="xl">
          {search && (
            <ToolbarItem>
              <SearchInput
                aria-label={search.ariaLabel}
                placeholder={search.placeholder}
                value={search.value}
                onChange={(_event, value) => search.onChange(value)}
                onClear={() => search.onChange('')}
              />
            </ToolbarItem>
          )}
          {(filters.length > 0 || filterItems) && (
            <ToolbarGroup variant="filter-group">
              {filters.map((filter) => (
                <CheckboxFilter key={filter.key} filter={filter} />
              ))}
              {filterItems}
            </ToolbarGroup>
          )}
        </ToolbarToggleGroup>
        {actions && <ToolbarItem align={{ default: 'alignEnd' }}>{actions}</ToolbarItem>}
      </ToolbarContent>
    </Toolbar>
  );
}

/** One checkbox `Select` plus its removable label group (labels show option labels, removal maps back to values). */
function CheckboxFilter({ filter }: { filter: ToolbarCheckboxFilter }) {
  const [isOpen, setIsOpen] = useState(false);
  const labelFor = (value: string) => filter.options.find((o) => o.value === value)?.label ?? value;

  return (
    <ToolbarFilter
      categoryName={filter.label}
      labels={filter.selected.map((value) => ({ key: value, node: labelFor(value) }))}
      deleteLabel={(_category, label) => filter.onToggle(typeof label === 'string' ? label : label.key)}
      deleteLabelGroup={() => filter.onClear()}
    >
      <Select
        role="menu"
        isOpen={isOpen}
        selected={filter.selected}
        onSelect={(_event, value) => filter.onToggle(String(value))}
        onOpenChange={setIsOpen}
        toggle={(toggleRef) => (
          <MenuToggle
            ref={toggleRef}
            aria-label={`Filter by ${filter.label}`}
            isExpanded={isOpen}
            onClick={() => setIsOpen((open) => !open)}
            badge={filter.selected.length > 0 ? <Badge isRead>{filter.selected.length}</Badge> : undefined}
          >
            {filter.label}
          </MenuToggle>
        )}
      >
        <SelectList>
          {filter.options.map((option) => (
            <SelectOption
              key={option.value}
              value={option.value}
              hasCheckbox
              isSelected={filter.selected.includes(option.value)}
            >
              {option.label}
            </SelectOption>
          ))}
        </SelectList>
      </Select>
    </ToolbarFilter>
  );
}
