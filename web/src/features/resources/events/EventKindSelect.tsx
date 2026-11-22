import {
  Button,
  MenuToggle,
  Select,
  SelectList,
  SelectOption,
  TextInputGroup,
  TextInputGroupMain,
  TextInputGroupUtilities,
} from '@patternfly/react-core';
import { RhUiCloseIcon } from '@patternfly/react-icons';
import { useId, useState, type KeyboardEvent } from 'react';
import { KindBadge } from '@/shared/ui';

/** One kind of the "Resources" select. */
export interface EventKindOption {
  /** `eventKindKey` (`<group>~<kind>`). */
  key: string;
  kind: string;
  /** Badge text; defaults to the kind's capitals. */
  abbr?: string;
}

/** Props for {@link EventKindSelect}. */
export interface EventKindSelectProps {
  options: readonly EventKindOption[];
  selected: readonly string[];
  /** Adds or removes one key; the menu stays open for more. */
  onToggle: (key: string) => void;
}

/**
 * The Events page's "Resources" select (OCP `ResourceListDropdown`, `public/components/resource-dropdown.tsx`): a
 * typeahead toggle whose text narrows the kinds, and a multi-select list of checkbox options with kind badges that
 * stays open while kinds are toggled. The placeholder counts the selection ("Resources (2)"). Arrow keys move the
 * highlight, Enter toggles it, Escape closes.
 */
export function EventKindSelect({ options, selected, onToggle }: EventKindSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [text, setText] = useState('');
  const [focused, setFocused] = useState<number | null>(null);
  const idPrefix = useId();
  const listId = `${idPrefix}-listbox`;
  const optionId = (index: number) => `${idPrefix}-option-${index}`;

  const query = text.trim().toLowerCase();
  const shown = query ? options.filter((option) => option.kind.toLowerCase().includes(query)) : options;
  const focusedKey = isOpen && focused !== null ? shown[focused]?.key : undefined;

  const close = () => {
    setIsOpen(false);
    setFocused(null);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (shown.length === 0) return;
      setIsOpen(true);
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setFocused((current) =>
        current === null ? (step === 1 ? 0 : shown.length - 1) : (current + step + shown.length) % shown.length,
      );
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (focusedKey !== undefined) onToggle(focusedKey);
      else setIsOpen(true);
    } else if (event.key === 'Escape' && isOpen) {
      event.stopPropagation();
      close();
    }
  };

  return (
    <Select
      role="menu"
      isOpen={isOpen}
      selected={selected}
      onSelect={(_event, value) => {
        if (typeof value === 'string') onToggle(value);
      }}
      onOpenChange={(open) => (open ? setIsOpen(true) : close())}
      maxMenuHeight="60vh"
      isScrollable
      shouldFocusFirstItemOnOpen={false}
      toggle={(toggleRef) => (
        <MenuToggle ref={toggleRef} variant="typeahead" isExpanded={isOpen} onClick={() => setIsOpen(!isOpen)}>
          <TextInputGroup isPlain>
            <TextInputGroupMain
              value={text}
              placeholder={selected.length > 0 ? `Resources (${selected.length})` : 'Resources'}
              aria-label="Resources"
              role="combobox"
              isExpanded={isOpen}
              aria-controls={listId}
              aria-activedescendant={focused !== null && isOpen ? optionId(focused) : undefined}
              inputProps={{ autoComplete: 'off' }}
              onClick={() => setIsOpen(true)}
              onChange={(_event, value) => {
                setText(value);
                setFocused(null);
                setIsOpen(true);
              }}
              onKeyDown={onKeyDown}
            />
            {text !== '' && (
              <TextInputGroupUtilities>
                <Button
                  variant="plain"
                  aria-label="Clear input value"
                  icon={<RhUiCloseIcon aria-hidden />}
                  onClick={() => setText('')}
                />
              </TextInputGroupUtilities>
            )}
          </TextInputGroup>
        </MenuToggle>
      )}
    >
      <SelectList isAriaMultiselectable id={listId} aria-label="Resources">
        {shown.length === 0 ? (
          <SelectOption isDisabled value="">
            No results found
          </SelectOption>
        ) : (
          shown.map((option, index) => (
            <SelectOption
              key={option.key}
              id={optionId(index)}
              value={option.key}
              hasCheckbox
              isSelected={selected.includes(option.key)}
              isFocused={focused === index}
            >
              <KindBadge kind={option.kind} abbr={option.abbr} /> {option.kind}
            </SelectOption>
          ))
        )}
      </SelectList>
    </Select>
  );
}
