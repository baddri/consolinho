import { FormGroup, FormHelperText, HelperText, HelperTextItem } from '@patternfly/react-core';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useController, type Control } from 'react-hook-form';
import { fieldIdFor } from '@/shared/forms';
import { TypeaheadSelect, type TypeaheadItem } from '@/shared/ui';
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
  /**
   * Also offer the typed text as a last item `Use "<typed>"` (Enter without a highlight picks it too), for names
   * that need not be listed, e.g. a group that doesn't exist on the host yet (UIG-2).
   */
  allowFreeText?: boolean;
  /** Focus the input when the field mounts, e.g. after the subject kind changed. */
  isAutoFocus?: boolean;
}

/** Most options shown at once; typing narrows the list. */
const MAX_OPTIONS = 50;

/**
 * Required typeahead single select bound to the grant form's `target`, on top of the shared `TypeaheadSelect`
 * (keyboard and ARIA live there): typing filters the options by value and `searchText`, a click or Enter on a
 * highlighted option selects it, and editing the text clears the selection, so only listed values (or, with
 * `allowFreeText`, the explicitly picked `Use "<typed>"`) are ever submitted.
 * Disabled options stay visible with their reason. Server and zod errors show under the field, which RHF focuses
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
  allowFreeText = false,
  isAutoFocus = false,
}: TypeaheadSelectFieldProps) {
  const { field, fieldState } = useController({ control, name: 'target' });
  const [input, setInput] = useState(field.value);
  const inputRef = useRef<HTMLInputElement>(null);
  const fieldId = fieldIdFor(field.name);
  const helperId = `${fieldId}-helper`;
  const error = fieldState.error;

  const { ref: registerRef } = field;
  useEffect(() => {
    registerRef({ focus: () => inputRef.current?.focus() });
  }, [registerRef]);
  useEffect(() => {
    if (isAutoFocus) inputRef.current?.focus();
  }, [isAutoFocus]);

  // With a selection shown in the input the whole list is offered again; otherwise the typed text filters it.
  const needle = field.value !== '' && input === field.value ? '' : input.trim().toLowerCase();
  const items: TypeaheadItem[] = options
    .filter((option) => `${option.value} ${option.searchText ?? ''}`.toLowerCase().includes(needle))
    .slice(0, MAX_OPTIONS)
    .map(({ value, description, isDisabled }) => ({ value, description, isDisabled }));
  const typed = input.trim();
  const offersTyped =
    allowFreeText &&
    typed !== '' &&
    typed !== field.value &&
    !options.some((option) => option.value === typed);
  if (offersTyped) items.push({ value: typed, label: `Use "${typed}"` });

  const setValue = (value: string) => {
    if (value === field.value) return;
    field.onChange(value);
    onValueChange?.(value);
  };

  return (
    <FormGroup label={label} isRequired fieldId={fieldId}>
      <TypeaheadSelect
        ariaLabel={label}
        clearAriaLabel={`Clear ${label}`}
        listAriaLabel={`${label} options`}
        placeholder={placeholder}
        inputId={fieldId}
        inputRef={inputRef}
        inputProps={{
          'aria-required': true,
          'aria-invalid': error !== undefined,
          'aria-describedby': error ? helperId : undefined,
        }}
        isFullWidth
        status={error ? 'danger' : undefined}
        inputValue={input}
        onInputChange={(text) => {
          setInput(text);
          setValue('');
        }}
        items={items}
        selected={field.value}
        onSelect={(value) => {
          setValue(value);
          setInput(value);
        }}
        onEnterWithoutHighlight={
          offersTyped
            ? () => {
                setValue(typed);
                setInput(typed);
              }
            : undefined
        }
        onClose={field.onBlur}
        isLoading={isLoading}
        emptyText={loadError}
      />
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
