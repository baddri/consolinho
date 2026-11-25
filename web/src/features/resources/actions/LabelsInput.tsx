import {
  FormHelperText,
  HelperText,
  HelperTextItem,
  Label,
  LabelGroup,
  TextInputGroup,
  TextInputGroupMain,
} from '@patternfly/react-core';
import { useId, type KeyboardEvent } from 'react';
import { labelEntryErrors, parseLabel } from './labelValidation';
import styles from './LabelsInput.module.css';

/**
 * Why the text still typed in a {@link LabelsInput} is not a valid new label (rule error or duplicate key), or
 * `undefined` when it is valid or blank. Entries are only added when valid, so only the typed text can be in error.
 */
export function typedLabelError(entries: readonly string[], text: string): string | undefined {
  const typed = text.trim();
  return typed === '' ? undefined : labelEntryErrors([...entries, typed]).get(entries.length);
}

/** The entries a save sends: the added ones plus the (valid) text still typed in the input. */
export function labelsWithTyped(entries: readonly string[], text: string): string[] {
  const typed = text.trim();
  return typed === '' ? [...entries] : [...entries, typed];
}

/** `key=value` entries as a label map (`key` alone means an empty value). */
export function labelsToMap(entries: readonly string[]): Record<string, string> {
  return Object.fromEntries(
    entries.map((entry) => {
      const { key, value } = parseLabel(entry);
      return [key, value];
    }),
  );
}

/** Props for {@link LabelsInput}. The parent owns both the entries and the typed text, so a save can include it. */
export interface LabelsInputProps {
  /** Id of the input, for the surrounding `FormGroup`'s `fieldId`. */
  id: string;
  entries: string[];
  onEntriesChange: (entries: string[]) => void;
  text: string;
  onTextChange: (text: string) => void;
  /** Focuses the input on mount (the modal's first field), as OCP's labels modal. */
  focusOnOpen?: boolean;
}

/**
 * OCP's labels chip input (`SelectorInput`, `.co-tags-input`): plain closable PF labels and the input in one
 * multi-line text-input group. Enter, comma or space adds the typed `key=value` (`key` alone means an empty value),
 * blur adds it too, Backspace on an empty input removes the last label. Invalid or duplicate text turns the group red
 * with the reason below (OCP `isInputValid`); parents disable their primary button via {@link typedLabelError}.
 * Render it inside a `FormGroup`.
 */
export function LabelsInput({ id, entries, onEntriesChange, text, onTextChange, focusOnOpen }: LabelsInputProps) {
  const helperId = useId();
  const error = typedLabelError(entries, text);
  const isInvalid = error !== undefined;

  const addTyped = () => {
    const typed = text.trim();
    if (typed === '' || isInvalid) return;
    onEntriesChange([...entries, typed]);
    onTextChange('');
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',' || event.key === ' ') {
      // Enter must not submit the form; comma and space are separators, never part of a label.
      event.preventDefault();
      addTyped();
    } else if (event.key === 'Backspace' && text === '' && entries.length > 0) {
      onEntriesChange(entries.slice(0, -1));
    }
  };

  return (
    <>
      <TextInputGroup className={styles.tagsInput} validated={isInvalid ? 'error' : 'default'}>
        <TextInputGroupMain
          inputId={id}
          aria-label="Labels"
          value={text}
          placeholder={entries.length === 0 ? 'app=frontend' : undefined}
          onChange={(_event, value) => onTextChange(value)}
          onBlur={addTyped}
          inputProps={{
            onKeyDown: handleKeyDown,
            spellCheck: false,
            autoComplete: 'off',
            autoFocus: focusOnOpen,
            'aria-invalid': isInvalid,
            'aria-describedby': isInvalid ? helperId : undefined,
          }}
        >
          {entries.length > 0 && (
            <LabelGroup numLabels={entries.length} aria-label="Labels">
              {entries.map((entry) => (
                <Label
                  key={entry}
                  onClose={() => onEntriesChange(entries.filter((other) => other !== entry))}
                  closeBtnAriaLabel={`Remove ${entry}`}
                >
                  {entry}
                </Label>
              ))}
            </LabelGroup>
          )}
        </TextInputGroupMain>
      </TextInputGroup>
      {isInvalid && (
        <FormHelperText>
          <HelperText id={helperId}>
            <HelperTextItem variant="error">{error}</HelperTextItem>
          </HelperText>
        </FormHelperText>
      )}
    </>
  );
}
