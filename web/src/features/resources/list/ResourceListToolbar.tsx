import { SearchInput, ToolbarFilter, ToolbarItem } from '@patternfly/react-core';
import { useState, type ReactNode } from 'react';
import { FilterToolbar } from '@/shared/table';
import type { ResourceDescriptor } from '../registry/types';
import type { ResourceFilters } from './useResourceFilters';

/** Props for {@link ResourceListToolbar}. */
export interface ResourceListToolbarProps {
  descriptor: ResourceDescriptor;
  filters: ResourceFilters;
  /** Right-aligned content (the top pagination). */
  actions?: ReactNode;
}

/**
 * Label-selector input: edits a draft and applies it to `?label=` on Enter (each change is a new list + watch, so
 * not per keystroke). Remounted by its parent whenever the applied selector changes, which resets the draft.
 */
function LabelSelectorInput({ applied, onApply }: { applied: string; onApply: (value: string) => void }) {
  const [draft, setDraft] = useState(applied);
  return (
    <SearchInput
      aria-label="Filter by label selector"
      placeholder="Label selector, e.g. app=web,tier!=db"
      value={draft}
      onChange={(_event, value) => setDraft(value)}
      onSearch={(_event, value) => onApply(value)}
      onClear={() => {
        setDraft('');
        onApply('');
      }}
    />
  );
}

/**
 * Toolbar of a resource list (UI-3): name search (`?name=`), label selector (`?label=`, applied on Enter, shown as a
 * removable "Label" chip) and the descriptor's checkbox filters, with "Clear all filters".
 */
export function ResourceListToolbar({ descriptor, filters, actions }: ResourceListToolbarProps) {
  const label = filters.labelSelector ?? '';
  return (
    <FilterToolbar
      ariaLabel={`${descriptor.model.labelPlural} toolbar`}
      search={{
        value: filters.name,
        onChange: filters.setName,
        placeholder: 'Filter by name',
        ariaLabel: 'Filter by name',
      }}
      filters={(descriptor.filters ?? []).map((filter) => ({
        key: filter.id,
        label: filter.title,
        options: filter.options,
        selected: filters.selected[filter.id] ?? [],
        onToggle: (value) => filters.toggle(filter.id, value),
        onClear: () => filters.clear(filter.id),
      }))}
      filterItems={
        <ToolbarFilter
          categoryName="Label"
          labels={label ? [label] : []}
          deleteLabel={() => filters.setLabelSelector('')}
          deleteLabelGroup={() => filters.setLabelSelector('')}
        >
          <ToolbarItem>
            <LabelSelectorInput key={label} applied={label} onApply={filters.setLabelSelector} />
          </ToolbarItem>
        </ToolbarFilter>
      }
      onClearAll={filters.clearAll}
      actions={actions}
    />
  );
}
