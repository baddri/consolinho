import {
  Button,
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
  MenuToggle,
  Select,
  SelectList,
  SelectOption,
  TextInputGroup,
  TextInputGroupMain,
  TextInputGroupUtilities,
} from '@patternfly/react-core';
import { TimesIcon } from '@patternfly/react-icons';
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useController, type Control } from 'react-hook-form';
import { fieldIdFor } from '@/shared/forms';
import type { GrantFormValues } from './grantForm.schema';

/** One choice of a {@link TypeaheadSelectField}. */
export interface TypeaheadOption {
  /** The value stored in the form (cluster name / username); also what the input shows once selected. */
  value: string;
  /** Extra text typing matches (e.g. display name). */
  searchText?: string;
  /** Second line of the option (environment label, display name, "already has access"). */
  description?: ReactNode;
  isDisabled?: boolean;
}

/** Props for {@link TypeaheadSelectField}. */
export interface TypeaheadSelectFieldProps {
  control: Control<GrantFormValues>;
  label: string;
  options: readonly TypeaheadOption[];
  placeholder: string;
  /** Text of the single disabled option while the options load. */
  isLoading?: boolean;
  /** Shown instead of "No results" when the options failed to load, e.g. "Could not load clusters". */
  loadError?: string;
  /** Called after the value changed (selected or cleared by typing), e.g. to reset the credential. */
  onValueChange?: (value: string) => void;
}

/** Most options shown at once; typing narrows the list. */
const MAX_OPTIONS = 50;

/**
 * Required typeahead single select bound to the grant form's `target` (PF6 typeahead `Select` + `TextInputGroup`
 * pattern, as in the audit `TypeaheadFilter`): typing filters the options by value and `searchText`, a click or Enter
 * on a highlighted option selects it, and editing the text clears the selection, so only listed values are ever
 * submitted. Disabled options stay visible with their reason. Arrow Up/Down move the highlight
 * (`aria-activedescendant`, focus stays in the input). Server and zod errors show under the field, which RHF focuses
 * through the input ref this component owns.
 */
export function TypeaheadSelectField({
  control,
  label,
  options,
  placeholder,
  isLoading = false,
  loadError,
  onValueChange,
}: TypeaheadSelectFieldProps) {
  const { field, fieldState } = useController({ control, name: 'target' });
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState(field.value);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const idPrefix = useId();
  const fieldId = fieldIdFor(field.name);
  const helperId = `${fieldId}-helper`;
  const error = fieldState.error;

  const { ref: registerRef } = field;
  useEffect(() => {
    registerRef({ focus: () => inputRef.current?.focus() });
  }, [registerRef]);

  // With a selection shown in the input the whole list is offered again; otherwise the typed text filters it.
  const needle = field.value !== '' && input === field.value ? '' : input.trim().toLowerCase();
  const shown = options
    .filter((option) => `${option.value} ${option.searchText ?? ''}`.toLowerCase().includes(needle))
    .slice(0, MAX_OPTIONS);
  const enabledIndexes = shown.flatMap((option, index) => (option.isDisabled ? [] : [index]));
  const optionId = (index: number) => `${idPrefix}-option-${index}`;
  const focused = isOpen && focusedIndex !== null ? shown[focusedIndex] : undefined;

  const setValue = (value: string) => {
    if (value === field.value) return;
    field.onChange(value);
    onValueChange?.(value);
  };

  const select = (value: string) => {
    const option = options.find((candidate) => candidate.value === value);
    if (!option || option.isDisabled) return;
    setValue(value);
    setInput(value);
    setFocusedIndex(null);
    setIsOpen(false);
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
      // Never submit the dialog from the typeahead.
      event.preventDefault();
      if (focused !== undefined) select(focused.value);
    } else if (event.key === 'Escape' && isOpen) {
      event.stopPropagation();
      setFocusedIndex(null);
      setIsOpen(false);
    }
  };

  const onInput = (next: string) => {
    setInput(next);
    setValue('');
    setFocusedIndex(null);
    setIsOpen(true);
  };

  return (
    <FormGroup label={label} isRequired fieldId={fieldId}>
      <Select
        variant="typeahead"
        isOpen={isOpen}
        selected={field.value}
        onSelect={(_event, value) => {
          if (typeof value === 'string') select(value);
        }}
        onOpenChange={(open) => {
          setIsOpen(open);
          if (!open) {
            setFocusedIndex(null);
            field.onBlur();
          }
        }}
        toggle={(toggleRef) => (
          <MenuToggle
            ref={toggleRef}
            variant="typeahead"
            isFullWidth
            isExpanded={isOpen}
            status={error ? 'danger' : undefined}
            onClick={() => setIsOpen((open) => !open)}
          >
            <TextInputGroup isPlain>
              <TextInputGroupMain
                ref={inputRef}
                inputId={fieldId}
                value={input}
                placeholder={placeholder}
                aria-label={label}
                role="combobox"
                isExpanded={isOpen}
                aria-activedescendant={focused !== undefined && focusedIndex !== null ? optionId(focusedIndex) : undefined}
                inputProps={{
                  autoComplete: 'off',
                  'aria-required': true,
                  'aria-invalid': error !== undefined,
                  'aria-describedby': error ? helperId : undefined,
                }}
                onClick={() => setIsOpen(true)}
                onChange={(_event, next) => onInput(next)}
                onKeyDown={onKeyDown}
              />
              {input !== '' && (
                <TextInputGroupUtilities>
                  <Button variant="plain" aria-label={`Clear ${label}`} icon={<TimesIcon />} onClick={() => onInput('')} />
                </TextInputGroupUtilities>
              )}
            </TextInputGroup>
          </MenuToggle>
        )}
      >
        <SelectList aria-label={`${label} options`}>
          {isLoading && (
            <SelectOption isDisabled value="">
              Loading…
            </SelectOption>
          )}
          {!isLoading &&
            shown.map((option, index) => (
              <SelectOption
                key={option.value}
                value={option.value}
                id={optionId(index)}
                isFocused={focusedIndex === index}
                isDisabled={option.isDisabled}
                description={option.description}
              >
                {option.value}
              </SelectOption>
            ))}
          {!isLoading && shown.length === 0 && (
            <SelectOption isDisabled value="">
              {loadError ?? 'No results'}
            </SelectOption>
          )}
        </SelectList>
      </Select>
      {error && (
        <FormHelperText>
          <HelperText>
            <HelperTextItem id={helperId} variant="error">
              {error.message}
            </HelperTextItem>
          </HelperText>
        </FormHelperText>
      )}
    </FormGroup>
  );
}
