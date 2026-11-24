import { Label, ToolbarFilter } from '@patternfly/react-core';
import { useContext, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import styles from './ConsoleDataView.module.css';
import { FilterTextInput } from './FilterTextInput';
import { LabelSuggestionsContext } from './labelSuggestions';

/** Suggestions shown at once, as OCP `AutocompleteInput` (`MAX_SUGGESTIONS`). */
const MAX_SUGGESTIONS = 5;

/** Props for {@link DataViewLabelFilter}; `value`, `onChange` and `showToolbarItem` come from `DataViewFilters`. */
export interface DataViewLabelFilterProps {
  /** Filter key in the data view's filter values (`label`). */
  filterId: string;
  /** Category name in the filter select and on the chips ("Label"). */
  title: string;
  /** Applied labels / selector terms, comma-separated (`app=web,tier!=db`). */
  value?: string;
  onChange?: (event: unknown, value: string) => void;
  showToolbarItem?: boolean;
}

/**
 * The comma-separated terms of a selector, without empty ones. As OCP `selector.ts:split`, a comma inside parentheses
 * belongs to a set term (`env in (prod,stage)` is one term).
 */
function terms(value: string): string[] {
  return value
    .split(/,(?![^(]*\))/)
    .map((term) => term.trim())
    .filter(Boolean);
}

/** OCP `fuzzyCaseInsensitive`: every character of `query` appears in `text`, in order, ignoring case. */
function fuzzyMatch(query: string, text: string): boolean {
  const haystack = text.toLowerCase();
  let from = 0;
  for (const char of query.toLowerCase()) {
    const at = haystack.indexOf(char, from);
    if (at < 0) return false;
    from = at + 1;
  }
  return true;
}

/**
 * OCP `DataViewLabelFilter` + `AutocompleteInput` (`public/components/autocomplete.tsx`): a "Filter by label" text
 * input; typing shows up to 5 matching labels of the listed objects as purple outline labels in a floating panel, and
 * clicking one adds it as a chip under "Label". Enter applies typed selector terms (`tier!=db`) as well. Escape or
 * a click outside the box hides the suggestions. The value is the terms joined by commas — a Kubernetes label selector.
 */
export function DataViewLabelFilter({
  title,
  value = '',
  onChange,
  showToolbarItem,
}: DataViewLabelFilterProps) {
  const labels = useContext(LabelSuggestionsContext);
  const [text, setText] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const applied = useMemo(() => terms(value), [value]);

  const apply = (next: string[]) => {
    setText('');
    setIsOpen(false);
    onChange?.(undefined, [...new Set(next)].join(','));
  };

  const suggestions = useMemo(() => {
    // OCP drops the blanks around "=" before matching.
    const query = text.trim().replace(/\s*=\s*/, '=');
    if (!query) return [];
    return labels.filter((label) => fuzzyMatch(query, label)).slice(0, MAX_SUGGESTIONS);
  }, [labels, text]);
  const isShown = isOpen && suggestions.length > 0;

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') setIsOpen(false);
    else if (event.key === 'Enter' && text.trim()) apply([...applied, ...terms(text)]);
  };

  // A click outside the box hides the suggestions (OCP `useDocumentListener`).
  const boxRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!isShown) return undefined;
    const onClick = (event: MouseEvent) => {
      if (!(event.target instanceof Node && boxRef.current?.contains(event.target))) setIsOpen(false);
    };
    globalThis.addEventListener('click', onClick);
    return () => globalThis.removeEventListener('click', onClick);
  }, [isShown]);

  return (
    <ToolbarFilter
      categoryName={title}
      showToolbarItem={showToolbarItem}
      labels={applied}
      deleteLabel={(_category, label) => apply(applied.filter((term) => term !== label))}
      deleteLabelGroup={() => apply([])}
    >
      <div ref={boxRef} className={styles.suggestionBox}>
        <FilterTextInput
          placeholder="Filter by label"
          value={text}
          onChange={(next) => {
            setText(next);
            setIsOpen(Boolean(next));
          }}
          onFocus={() => setIsOpen(Boolean(text.trim()))}
          onKeyDown={onKeyDown}
          isShortcutActive={showToolbarItem}
        />
        {isShown && (
          <div className={styles.suggestions}>
            {suggestions.map((label) => (
              <div key={label}>
                <Label variant="outline" color="purple" onClick={() => apply([...applied, label])}>
                  {label}
                </Label>
              </div>
            ))}
          </div>
        )}
      </div>
    </ToolbarFilter>
  );
}
