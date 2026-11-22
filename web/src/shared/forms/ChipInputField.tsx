import {
  Button,
  FormGroup,
  Label,
  LabelGroup,
  TextInputGroup,
  TextInputGroupMain,
  TextInputGroupUtilities,
} from '@patternfly/react-core';
import { TimesIcon } from '@patternfly/react-icons';
import { useState, type KeyboardEvent } from 'react';
import { useController, type FieldError, type FieldPathByValue, type FieldValues } from 'react-hook-form';
import { fieldA11y, FieldHelperText } from './fieldA11y';
import type { FieldBaseProps } from './types';

/** Props for {@link ChipInputField}. */
export type ChipInputFieldProps<
  T extends FieldValues,
  N extends FieldPathByValue<T, string[]>,
  TTransformed = T,
> = FieldBaseProps<T, N, TTransformed> & {
  /** Static helper text; the "N of max" counter is appended when `maxItems` is set and at least one entry exists. */
  helperText?: string;
  /** Shown as "3 of 10" in the helper text. Not enforced here: the zod schema reports too many entries. */
  maxItems?: number;
  /** Turns typed text into an entry; default trims. An empty result is ignored. */
  normalize?: (raw: string) => string;
  placeholder?: string;
};

const trim = (raw: string) => raw.trim();

/** Error messages of a `string[]` field: the whole-list error (`message` or `root`) and every per-entry error. */
function listErrorMessages(error: unknown): { messages: string[]; invalidIndexes: Set<number> } {
  const messages: string[] = [];
  const invalidIndexes = new Set<number>();
  if (typeof error !== 'object' || error === null) return { messages, invalidIndexes };
  const tree = error as Record<string, unknown>;
  const push = (entry: unknown) => {
    const message = typeof entry === 'object' && entry !== null ? (entry as FieldError).message : undefined;
    if (typeof message === 'string' && message !== '' && !messages.includes(message)) messages.push(message);
    return message !== undefined;
  };
  push(tree);
  push(tree.root);
  for (const [key, entry] of Object.entries(tree)) {
    if (/^\d+$/.test(key) && push(entry)) invalidIndexes.add(Number(key));
  }
  return { messages, invalidIndexes };
}

/**
 * Chip ("label") input bound to a `string[]` form value (ADR-0015 §2), built from PF `TextInputGroup` with a
 * `LabelGroup` of closable `Label`s like the PF "text input group with filters" example (spec §5 namespace input).
 * Enter or `,` adds the typed text (normalized, empty and duplicate entries ignored), pasting `a,b` adds both,
 * leaving the input adds what is still typed (so a click on submit never loses it) and Backspace on an empty input
 * removes the last entry. Errors from zod (`path: [name, index]`) or the server (`name[i]`) are listed under the
 * field and the offending chips turn red; the messages name the entry.
 */
export function ChipInputField<T extends FieldValues, N extends FieldPathByValue<T, string[]>, TTransformed = T>({
  control,
  name,
  label,
  isRequired = false,
  helperText,
  maxItems,
  normalize = trim,
  placeholder,
}: ChipInputFieldProps<T, N, TTransformed>) {
  const {
    field: { ref, value, onChange, onBlur, name: fieldName, disabled },
    fieldState,
  } = useController({ control, name });
  const [text, setText] = useState('');
  const entries: string[] = Array.isArray(value) ? (value as string[]) : [];
  const { messages, invalidIndexes } = listErrorMessages(fieldState.error);
  const error: FieldError | undefined = messages.length > 0 ? { type: 'validate', message: messages.join(' ') } : undefined;
  const counter = maxItems !== undefined && entries.length > 0 ? `${entries.length} of ${maxItems}` : undefined;
  const helper = [helperText, counter].filter(Boolean).join(' ');
  const a11y = fieldA11y(name, error, helper);

  /** Appends the normalized `raws` that are neither empty nor already entered. */
  const add = (raws: readonly string[]) => {
    const next = [...entries];
    for (const raw of raws) {
      const entry = normalize(raw);
      if (entry !== '' && !next.includes(entry)) next.push(entry);
    }
    if (next.length !== entries.length) onChange(next);
  };

  const handleChange = (typed: string) => {
    // Typed commas are caught in onKeyDown; this splits pasted lists and keeps the text after the last comma.
    const parts = typed.split(',');
    const rest = parts.pop() ?? '';
    if (parts.length > 0) add(parts);
    setText(rest);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') {
      // Enter must not submit the surrounding form.
      event.preventDefault();
      add([text]);
      setText('');
    } else if (event.key === 'Backspace' && text === '' && entries.length > 0) {
      onChange(entries.slice(0, -1));
    }
  };

  const handleBlur = () => {
    if (text !== '') {
      add([text]);
      setText('');
    }
    onBlur();
  };

  return (
    <FormGroup label={label} isRequired={isRequired} fieldId={a11y.fieldId}>
      <TextInputGroup isDisabled={disabled} validated={a11y.isInvalid ? 'error' : 'default'}>
        <TextInputGroupMain
          ref={ref}
          inputId={a11y.fieldId}
          name={fieldName}
          aria-label={label}
          value={text}
          placeholder={placeholder}
          onChange={(_event, typed) => handleChange(typed)}
          onBlur={handleBlur}
          inputProps={{
            onKeyDown: handleKeyDown,
            spellCheck: false,
            autoComplete: 'off',
            'aria-invalid': a11y.isInvalid,
            'aria-required': isRequired || undefined,
            'aria-describedby': a11y.describedBy,
          }}
        >
          {entries.length > 0 && (
            <LabelGroup aria-label={`${label} entries`} numLabels={entries.length}>
              {entries.map((entry, index) => (
                <Label
                  key={entry}
                  color={invalidIndexes.has(index) ? 'red' : undefined}
                  onClose={() => onChange(entries.filter((other) => other !== entry))}
                  closeBtnAriaLabel={`Remove ${entry}`}
                  isDisabled={disabled}
                >
                  {entry}
                </Label>
              ))}
            </LabelGroup>
          )}
        </TextInputGroupMain>
        {(entries.length > 0 || text !== '') && (
          <TextInputGroupUtilities>
            <Button
              variant="plain"
              aria-label={`Clear ${label}`}
              icon={<TimesIcon />}
              isDisabled={disabled}
              onClick={() => {
                setText('');
                onChange([]);
              }}
            />
          </TextInputGroupUtilities>
        )}
      </TextInputGroup>
      <FieldHelperText id={a11y.helperId} error={error} helperText={helper} />
    </FormGroup>
  );
}
