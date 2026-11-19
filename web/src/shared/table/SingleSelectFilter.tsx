import { MenuToggle, Select, SelectList, SelectOption, ToolbarFilter } from '@patternfly/react-core';
import { useState } from 'react';
import type { FilterOption } from './FilterToolbar';

/** Props for {@link SingleSelectFilter}. */
export interface SingleSelectFilterProps {
  /** Category name shown on the toggle ("Filter by …") and on the removable label group. */
  categoryName: string;
  options: FilterOption[];
  /** Selected option value; `undefined` = no filter. */
  value?: string;
  /** Sets the filter; `undefined` removes it. */
  onChange: (value?: string) => void;
}

/**
 * Single-choice filter ("Read only", audit "Category", …) for `FilterToolbar`'s `filterItems`, so its removable label
 * shares the toolbar's label collapse and "Clear all filters". Picking the selected option again clears it. Pair with
 * a `single` filter of `useUrlFilters` (`setSingle`).
 */
export function SingleSelectFilter({ categoryName, options, value, onChange }: SingleSelectFilterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const labelFor = (v: string) => options.find((o) => o.value === v)?.label ?? v;

  return (
    <ToolbarFilter
      categoryName={categoryName}
      labels={value ? [{ key: value, node: labelFor(value) }] : []}
      deleteLabel={() => onChange(undefined)}
      deleteLabelGroup={() => onChange(undefined)}
    >
      <Select
        isOpen={isOpen}
        selected={value}
        onSelect={(_event, selected) => {
          const next = String(selected);
          onChange(next === value ? undefined : next);
          setIsOpen(false);
        }}
        onOpenChange={setIsOpen}
        toggle={(toggleRef) => (
          <MenuToggle
            ref={toggleRef}
            aria-label={`Filter by ${categoryName}`}
            isExpanded={isOpen}
            onClick={() => setIsOpen((open) => !open)}
          >
            {categoryName}
          </MenuToggle>
        )}
      >
        <SelectList>
          {options.map((option) => (
            <SelectOption key={option.value} value={option.value}>
              {option.label}
            </SelectOption>
          ))}
        </SelectList>
      </Select>
    </ToolbarFilter>
  );
}
