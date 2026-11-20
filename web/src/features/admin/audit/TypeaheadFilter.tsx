import { ToolbarFilter } from '@patternfly/react-core';
import { useState } from 'react';
import { TypeaheadSelect, type TypeaheadItem } from '@/shared/ui';

/** Props for {@link TypeaheadFilter}. */
export interface TypeaheadFilterProps {
  /** Category name of the label group and the input's accessible name ("Filter by …"). */
  categoryName: string;
  /** Suggestions (e.g. current users); any other text is accepted too. */
  options: readonly string[];
  /** Applied value; `undefined` = no filter. */
  value?: string;
  /** Applies (or with `undefined` removes) the filter. */
  onChange: (value?: string) => void;
  /** Input placeholder. */
  placeholder: string;
}

/** Most suggestions shown at once; typing narrows the list. */
const MAX_SUGGESTIONS = 20;

/**
 * Toolbar typeahead with free text (audit actor and cluster filters, AUD-4) on top of the shared `TypeaheadSelect`
 * (keyboard and ARIA live there): suggestions narrow while typing, a click applies one, and Enter applies the typed
 * text as is — so deleted users and clusters, which are no longer in the suggestion lists, stay searchable; the menu
 * also offers it as `Use "text"`. The applied value shows as a removable label; the input clears after applying.
 */
export function TypeaheadFilter({ categoryName, options, value, onChange, placeholder }: TypeaheadFilterProps) {
  const [input, setInput] = useState('');

  const text = input.trim();
  const needle = text.toLowerCase();
  const suggestions = options.filter((option) => option.toLowerCase().includes(needle)).slice(0, MAX_SUGGESTIONS);
  const items: TypeaheadItem[] = suggestions.map((option) => ({ value: option }));
  // Free text comes last, so Arrow keys reach it after the suggestions.
  if (text !== '' && !options.includes(text)) items.push({ value: text, label: `Use "${text}"` });

  const apply = (next: string) => {
    onChange(next === '' ? undefined : next);
    setInput('');
  };

  return (
    <ToolbarFilter
      categoryName={categoryName}
      labels={value ? [{ key: value, node: value }] : []}
      deleteLabel={() => onChange(undefined)}
      deleteLabelGroup={() => onChange(undefined)}
    >
      <TypeaheadSelect
        ariaLabel={`Filter by ${categoryName}`}
        clearAriaLabel={`Clear ${categoryName} input`}
        placeholder={placeholder}
        inputValue={input}
        onInputChange={setInput}
        items={items}
        selected={value}
        onSelect={apply}
        onEnterWithoutHighlight={() => {
          if (text !== '') apply(text);
        }}
        emptyText="No suggestions"
      />
    </ToolbarFilter>
  );
}
