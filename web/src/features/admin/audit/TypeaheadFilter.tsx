import {
  Button,
  MenuToggle,
  Select,
  SelectList,
  SelectOption,
  TextInputGroup,
  TextInputGroupMain,
  TextInputGroupUtilities,
  ToolbarFilter,
} from '@patternfly/react-core';
import { TimesIcon } from '@patternfly/react-icons';
import { useId, useState, type KeyboardEvent } from 'react';

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
 * Toolbar typeahead with free text (audit actor and cluster filters, AUD-4): suggestions narrow while typing, a click
 * applies one, and Enter applies the typed text as is — so deleted users and clusters, which are no longer in the
 * suggestion lists, stay searchable. Arrow Up/Down move a highlighted option (announced via
 * `aria-activedescendant`, focus stays in the input) and Enter applies it. The applied value shows as a removable
 * label; the input clears after applying.
 */
export function TypeaheadFilter({ categoryName, options, value, onChange, placeholder }: TypeaheadFilterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const idPrefix = useId();

  const text = input.trim();
  const needle = text.toLowerCase();
  const suggestions = options.filter((option) => option.toLowerCase().includes(needle)).slice(0, MAX_SUGGESTIONS);
  const offerFreeText = text !== '' && !options.includes(text);
  // Navigable items in display order: suggestions, then the free-text option.
  const items = offerFreeText ? [...suggestions, text] : suggestions;
  const optionId = (index: number) => `${idPrefix}-option-${index}`;
  const focused = isOpen && focusedIndex !== null ? items[focusedIndex] : undefined;

  const apply = (next: string) => {
    onChange(next === '' ? undefined : next);
    setInput('');
    setFocusedIndex(null);
    setIsOpen(false);
  };

  /** Moves the highlight by `step`, wrapping around; opens the menu first. */
  const moveFocus = (step: 1 | -1) => {
    if (items.length === 0) return;
    setIsOpen(true);
    setFocusedIndex((current) => {
      if (current === null || !isOpen) return step === 1 ? 0 : items.length - 1;
      return (current + step + items.length) % items.length;
    });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      moveFocus(event.key === 'ArrowDown' ? 1 : -1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const next = focused ?? text;
      if (next !== '') apply(next);
    } else if (event.key === 'Escape') {
      setFocusedIndex(null);
      setIsOpen(false);
    }
  };

  return (
    <ToolbarFilter
      categoryName={categoryName}
      labels={value ? [{ key: value, node: value }] : []}
      deleteLabel={() => onChange(undefined)}
      deleteLabelGroup={() => onChange(undefined)}
    >
      <Select
        variant="typeahead"
        isOpen={isOpen}
        selected={value}
        onSelect={(_event, selected) => apply(String(selected))}
        onOpenChange={(open) => {
          setIsOpen(open);
          if (!open) setFocusedIndex(null);
        }}
        toggle={(toggleRef) => (
          <MenuToggle
            ref={toggleRef}
            variant="typeahead"
            isExpanded={isOpen}
            onClick={() => setIsOpen((open) => !open)}
          >
            <TextInputGroup isPlain>
              <TextInputGroupMain
                value={input}
                placeholder={placeholder}
                aria-label={`Filter by ${categoryName}`}
                inputProps={{ autoComplete: 'off' }}
                role="combobox"
                isExpanded={isOpen}
                aria-activedescendant={focused !== undefined && focusedIndex !== null ? optionId(focusedIndex) : undefined}
                onClick={() => setIsOpen(true)}
                onChange={(_event, next) => {
                  setInput(next);
                  setFocusedIndex(null);
                  setIsOpen(true);
                }}
                onKeyDown={onKeyDown}
              />
              {input && (
                <TextInputGroupUtilities>
                  <Button
                    variant="plain"
                    aria-label={`Clear ${categoryName} input`}
                    icon={<TimesIcon />}
                    onClick={() => setInput('')}
                  />
                </TextInputGroupUtilities>
              )}
            </TextInputGroup>
          </MenuToggle>
        )}
      >
        <SelectList>
          {suggestions.map((option, index) => (
            <SelectOption key={option} value={option} id={optionId(index)} isFocused={focusedIndex === index}>
              {option}
            </SelectOption>
          ))}
          {offerFreeText && (
            <SelectOption
              key={`free:${text}`}
              value={text}
              id={optionId(suggestions.length)}
              isFocused={focusedIndex === suggestions.length}
            >
              {`Use "${text}"`}
            </SelectOption>
          )}
          {suggestions.length === 0 && !offerFreeText && (
            <SelectOption isDisabled value="">
              No suggestions
            </SelectOption>
          )}
        </SelectList>
      </Select>
    </ToolbarFilter>
  );
}
