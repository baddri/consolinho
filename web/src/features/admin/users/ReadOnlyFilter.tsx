import { MenuToggle, Select, SelectList, SelectOption, ToolbarFilter } from '@patternfly/react-core';
import { useState } from 'react';
import { READ_ONLY_OPTIONS } from './userFilters';

/** Props for {@link ReadOnlyFilter}. */
export interface ReadOnlyFilterProps {
  /** `yes`, `no` or `undefined` (no filter). */
  value: string | undefined;
  /** Sets the filter; `undefined` removes it. */
  onChange: (value?: string) => void;
}

const CATEGORY = 'Read only';

const labelFor = (value: string) => READ_ONLY_OPTIONS.find((o) => o.value === value)?.label ?? value;

/**
 * Single-choice "Read only" filter of the users toolbar, passed to `FilterToolbar` as `filterItems` so its removable
 * label shares the toolbar's label collapse and "Clear all filters". Picking the selected option again clears it.
 */
export function ReadOnlyFilter({ value, onChange }: ReadOnlyFilterProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <ToolbarFilter
      categoryName={CATEGORY}
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
            aria-label={`Filter by ${CATEGORY}`}
            isExpanded={isOpen}
            onClick={() => setIsOpen((open) => !open)}
          >
            {CATEGORY}
          </MenuToggle>
        )}
      >
        <SelectList>
          {READ_ONLY_OPTIONS.map((option) => (
            <SelectOption key={option.value} value={option.value}>
              {option.label}
            </SelectOption>
          ))}
        </SelectList>
      </Select>
    </ToolbarFilter>
  );
}
