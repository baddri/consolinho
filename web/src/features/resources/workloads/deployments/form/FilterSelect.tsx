import {
  Divider,
  MenuSearch,
  MenuSearchInput,
  MenuToggle,
  SearchInput,
  Select,
  SelectGroup,
  SelectList,
  SelectOption,
  type MenuToggleElement,
} from '@patternfly/react-core';
import { Fragment, useState, type ReactNode, type Ref } from 'react';

/** One item of a {@link FilterSelect}. */
export interface FilterSelectOption {
  value: string;
  /** What the menu shows (e.g. a kind badge and the name). */
  label: ReactNode;
  /** The text the filter matches. */
  text: string;
}

/** A titled group of options; groups after the first get a divider before them. */
export interface FilterSelectGroup {
  label?: string;
  options: readonly FilterSelectOption[];
}

/** Props for {@link FilterSelect}. */
export interface FilterSelectProps {
  /** The toggle's content: the selection, or a "Select a …" title. */
  toggleContent: ReactNode;
  selected: string;
  groups: readonly FilterSelectGroup[];
  onSelect: (value: string) => void;
  /** The filter input's placeholder and label. */
  searchPlaceholder: string;
  isDisabled?: boolean;
  isInvalid?: boolean;
  describedBy?: string;
}

/**
 * OCP's `ConsoleSelect` with `autocompleteFilter`: a full-width select whose menu starts with a filter input and lists
 * grouped options (headers, a divider between groups). Focus returns to the toggle on select; Tab stays in the menu so
 * it can reach the filter.
 */
export function FilterSelect({
  toggleContent,
  selected,
  groups,
  onSelect,
  searchPlaceholder,
  isDisabled,
  isInvalid,
  describedBy,
}: FilterSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const needle = filter.trim().toLowerCase();
  const shown = groups
    .map((group) => ({
      ...group,
      options: group.options.filter((o) => o.text.toLowerCase().includes(needle)),
    }))
    .filter((group) => group.options.length > 0);
  const setOpen = (open: boolean) => {
    setIsOpen(open);
    if (!open) setFilter('');
  };
  return (
    <Select
      isOpen={isOpen}
      selected={selected}
      onOpenChange={setOpen}
      onOpenChangeKeys={['Escape']}
      shouldFocusToggleOnSelect
      isScrollable
      onSelect={(_event, value) => {
        if (typeof value === 'string') onSelect(value);
        setOpen(false);
      }}
      toggle={(toggleRef: Ref<MenuToggleElement>) => (
        <MenuToggle
          ref={toggleRef}
          isFullWidth
          isExpanded={isOpen}
          isDisabled={isDisabled}
          status={isInvalid ? 'danger' : undefined}
          aria-describedby={describedBy}
          onClick={() => setOpen(!isOpen)}
        >
          {toggleContent}
        </MenuToggle>
      )}
    >
      <MenuSearch>
        <MenuSearchInput>
          <SearchInput
            aria-label={searchPlaceholder}
            placeholder={searchPlaceholder}
            value={filter}
            onChange={(_event, value) => setFilter(value)}
          />
        </MenuSearchInput>
      </MenuSearch>
      <Divider />
      {shown.length === 0 ? (
        <SelectList>
          <SelectOption isDisabled>No results found</SelectOption>
        </SelectList>
      ) : (
        shown.map((group, position) => (
          <Fragment key={group.label ?? position}>
            {position > 0 && <Divider />}
            {group.label ? (
              <SelectGroup label={group.label}>
                <SelectList>{renderOptions(group.options)}</SelectList>
              </SelectGroup>
            ) : (
              <SelectList>{renderOptions(group.options)}</SelectList>
            )}
          </Fragment>
        ))
      )}
    </Select>
  );
}

const renderOptions = (options: readonly FilterSelectOption[]) =>
  options.map((option) => (
    <SelectOption key={option.value} value={option.value}>
      {option.label}
    </SelectOption>
  ));
