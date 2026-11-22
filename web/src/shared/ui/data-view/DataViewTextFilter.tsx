import { ToolbarFilter } from '@patternfly/react-core';
import { FilterTextInput } from './FilterTextInput';

/** Props for {@link DataViewTextFilter}; `value`, `onChange` and `showToolbarItem` come from `DataViewFilters`. */
export interface DataViewTextFilterProps {
  /** Filter key in the data view's filter values (`name`). */
  filterId: string;
  /** Category name in the filter select and on the chip ("Name"). */
  title: string;
  placeholder: string;
  value?: string;
  onChange?: (event: unknown, value: string) => void;
  showToolbarItem?: boolean;
}

/**
 * OCP `DataViewTextFilter`: a {@link FilterTextInput} ("Filter by name"), shown as a removable chip under its
 * category while set.
 */
export function DataViewTextFilter({
  title,
  placeholder,
  value = '',
  onChange,
  showToolbarItem,
}: DataViewTextFilterProps) {
  return (
    <ToolbarFilter
      categoryName={title}
      showToolbarItem={showToolbarItem}
      labels={value ? [value] : []}
      deleteLabel={() => onChange?.(undefined, '')}
    >
      <FilterTextInput
        placeholder={placeholder}
        value={value}
        onChange={(next) => onChange?.(undefined, next)}
        isShortcutActive={showToolbarItem}
      />
    </ToolbarFilter>
  );
}
