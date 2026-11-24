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
import { TimesIcon } from '@patternfly/react-icons';
import { useId, useState, type AriaAttributes, type KeyboardEvent, type ReactNode, type Ref } from 'react';

/** One option of a {@link TypeaheadSelect}. */
export interface TypeaheadItem {
  /** Value passed to `onSelect`; unique within the list. */
  value: string;
  /** Option text; defaults to `value` (e.g. `Use "text"` for a free-text item). */
  label?: ReactNode;
  /** Second line of the option. */
  description?: ReactNode;
  /** Shown, but neither highlightable nor selectable. */
  isDisabled?: boolean;
}

/** Props for {@link TypeaheadSelect}. */
export interface TypeaheadSelectProps {
  /** Accessible name of the input (combobox). */
  ariaLabel: string;
  /** Accessible name of the clear button. */
  clearAriaLabel: string;
  placeholder: string;
  /** Text in the input; owned by the caller, which also filters `items` with it. */
  inputValue: string;
  /** Typing (or the clear button with `''`) changed the text. */
  onInputChange: (text: string) => void;
  /** Options to show, already filtered, in display order. */
  items: readonly TypeaheadItem[];
  /** An enabled option was clicked or chosen with Enter; the menu closes. */
  onSelect: (value: string) => void;
  /** Enter without a highlighted option (e.g. apply free text). Enter never submits a surrounding form. */
  onEnterWithoutHighlight?: () => void;
  /** The menu closed (click outside, Escape, Tab); e.g. RHF `onBlur`. */
  onClose?: () => void;
  /** Value marked as selected in the menu. */
  selected?: string;
  /** Show a single disabled "Loading…" option instead of `items`. */
  isLoading?: boolean;
  /** Text of the disabled option shown when `items` is empty. */
  emptyText?: string;
  /** Accessible name of the option list. */
  listAriaLabel?: string;
  /** `id` of the input (label `for`, RHF field id). */
  inputId?: string;
  /** Ref to the input, e.g. so RHF can focus the field on an error. */
  inputRef?: Ref<HTMLInputElement>;
  /** Extra attributes of the input (`aria-required`, `aria-invalid`, `aria-describedby`). */
  inputProps?: Pick<AriaAttributes, 'aria-required' | 'aria-invalid' | 'aria-describedby'>;
  isFullWidth?: boolean;
  /** Danger border on the toggle, e.g. for a field error. */
  status?: 'danger';
}

/**
 * The one PF6 typeahead (`Select variant="typeahead"` + `MenuToggle` + `TextInputGroup`) behind every typeahead in the
 * app — the grant dialog's cluster/user field and the audit log's free-text filters — so keyboard and ARIA behaviour
 * are written once. It lives in `shared/ui`, not `shared/forms`, because it is not bound to a form: callers own the
 * input text and the filtering, and decide what selecting means (set a form value, apply a filter).
 *
 * Keyboard: Arrow Up/Down open the menu and move a highlight over the enabled options, wrapping around; focus stays
 * in the input and the highlight is announced with `aria-activedescendant`. Enter picks the highlighted option (or
 * calls `onEnterWithoutHighlight`) and never submits a surrounding form; Escape closes an open menu without closing a
 * surrounding modal. The input is a `combobox` whose `aria-controls` points at the option list.
 */
export function TypeaheadSelect({
  ariaLabel,
  clearAriaLabel,
  placeholder,
  inputValue,
  onInputChange,
  items,
  onSelect,
  onEnterWithoutHighlight,
  onClose,
  selected,
  isLoading = false,
  emptyText = 'No results',
  listAriaLabel,
  inputId,
  inputRef,
  inputProps,
  isFullWidth,
  status,
}: TypeaheadSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const idPrefix = useId();
  const listId = `${idPrefix}-listbox`;
  const optionId = (index: number) => `${idPrefix}-option-${index}`;

  const shown = isLoading ? [] : items;
  const enabledIndexes = shown.flatMap((item, index) => (item.isDisabled ? [] : [index]));
  const focused = isOpen && focusedIndex !== null ? shown[focusedIndex] : undefined;

  const close = () => {
    setFocusedIndex(null);
    setIsOpen(false);
  };

  const choose = (value: string) => {
    const item = shown.find((candidate) => candidate.value === value);
    if (!item || item.isDisabled) return;
    onSelect(value);
    close();
  };

  /** Moves the highlight by `step` over the enabled options, wrapping around; opens the menu first. */
  const moveFocus = (step: 1 | -1) => {
    if (enabledIndexes.length === 0) return;
    setIsOpen(true);
    const position = focusedIndex === null || !isOpen ? -1 : enabledIndexes.indexOf(focusedIndex);
    const next =
      position === -1
        ? step === 1
          ? 0
          : enabledIndexes.length - 1
        : (position + step + enabledIndexes.length) % enabledIndexes.length;
    setFocusedIndex(enabledIndexes[next] ?? null);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      moveFocus(event.key === 'ArrowDown' ? 1 : -1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (focused !== undefined) choose(focused.value);
      else if (onEnterWithoutHighlight) {
        // Like picking an option: the free text is applied, so the menu closes.
        onEnterWithoutHighlight();
        close();
      }
    } else if (event.key === 'Escape' && isOpen) {
      event.stopPropagation();
      close();
    }
  };

  const changeInput = (text: string) => {
    onInputChange(text);
    setFocusedIndex(null);
  };

  return (
    <Select
      variant="typeahead"
      isOpen={isOpen}
      selected={selected}
      onSelect={(_event, value) => {
        if (typeof value === 'string') choose(value);
      }}
      onOpenChange={(open) => {
        setIsOpen(open);
        if (!open) {
          setFocusedIndex(null);
          onClose?.();
        }
      }}
      toggle={(toggleRef) => (
        <MenuToggle
          ref={toggleRef}
          variant="typeahead"
          isFullWidth={isFullWidth}
          isExpanded={isOpen}
          status={status}
          onClick={() => setIsOpen((open) => !open)}
        >
          <TextInputGroup isPlain>
            <TextInputGroupMain
              ref={inputRef}
              inputId={inputId}
              value={inputValue}
              placeholder={placeholder}
              aria-label={ariaLabel}
              role="combobox"
              isExpanded={isOpen}
              aria-controls={listId}
              aria-activedescendant={
                focused !== undefined && focusedIndex !== null ? optionId(focusedIndex) : undefined
              }
              inputProps={{ autoComplete: 'off', ...inputProps }}
              onClick={() => setIsOpen(true)}
              onChange={(_event, text) => {
                changeInput(text);
                setIsOpen(true);
              }}
              onKeyDown={onKeyDown}
            />
            {inputValue !== '' && (
              <TextInputGroupUtilities>
                <Button
                  variant="plain"
                  aria-label={clearAriaLabel}
                  icon={<TimesIcon />}
                  onClick={() => changeInput('')}
                />
              </TextInputGroupUtilities>
            )}
          </TextInputGroup>
        </MenuToggle>
      )}
    >
      <SelectList id={listId} aria-label={listAriaLabel}>
        {isLoading && (
          <SelectOption isDisabled value="">
            Loading…
          </SelectOption>
        )}
        {shown.map((item, index) => (
          <SelectOption
            key={item.value}
            value={item.value}
            id={optionId(index)}
            isFocused={focusedIndex === index}
            isDisabled={item.isDisabled}
            description={item.description}
          >
            {item.label ?? item.value}
          </SelectOption>
        ))}
        {!isLoading && shown.length === 0 && (
          <SelectOption isDisabled value="">
            {emptyText}
          </SelectOption>
        )}
      </SelectList>
    </Select>
  );
}
