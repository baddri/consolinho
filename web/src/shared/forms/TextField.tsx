import {
  Button,
  FormGroup,
  InputGroup,
  InputGroupItem,
  TextInput,
  type TextInputProps,
} from '@patternfly/react-core';
import { EyeIcon, EyeSlashIcon } from '@patternfly/react-icons';
import { useState } from 'react';
import { useController, type FieldPathByValue, type FieldValues } from 'react-hook-form';
import { fieldA11y, FieldHelperText } from './fieldA11y';
import type { FieldBaseProps } from './types';

/** TextInput props the adapter owns (value binding, id, validation state). */
type OwnedTextInputProps = 'value' | 'onChange' | 'onBlur' | 'name' | 'id' | 'validated' | 'isRequired' | 'label';

/** Props for {@link TextField}: the common field props plus any other `TextInput` prop (`type`, `placeholder`, …). */
export type TextFieldProps<
  T extends FieldValues,
  N extends FieldPathByValue<T, string | null | undefined>,
  TTransformed = T,
> = FieldBaseProps<T, N, TTransformed> & Omit<TextInputProps, OwnedTextInputProps>;

/**
 * Single-line text input bound to react-hook-form (ADR-0015 §2). `type="password"` (tokens, secrets) adds a
 * show/hide toggle and defaults to `autoComplete="off"` so browsers never offer to store a ServiceAccount token.
 * `null`/`undefined` values render as empty; forms should still default text fields to `''` (see
 * `applyServerErrors`).
 */
export function TextField<
  T extends FieldValues,
  N extends FieldPathByValue<T, string | null | undefined>,
  TTransformed = T,
>({ control, name, label, isRequired = false, helperText, type, ...inputProps }: TextFieldProps<T, N, TTransformed>) {
  // Destructured so the React compiler lint sees `ref` as the only ref (it treats a whole object passed via `ref` as one).
  const {
    field: { ref, value, onChange, onBlur, name: fieldName, disabled },
    fieldState,
  } = useController({ control, name });
  const a11y = fieldA11y(name, fieldState.error, helperText);
  const [isRevealed, setIsRevealed] = useState(false);
  const isPassword = type === 'password';

  const input = (
    <TextInput
      autoComplete={isPassword ? 'off' : undefined}
      {...inputProps}
      ref={ref}
      id={a11y.fieldId}
      name={fieldName}
      type={isPassword && isRevealed ? 'text' : type}
      value={typeof value === 'string' ? value : ''}
      onChange={(_event, text) => onChange(text)}
      onBlur={onBlur}
      isDisabled={inputProps.isDisabled ?? disabled}
      validated={a11y.isInvalid ? 'error' : 'default'}
      aria-invalid={a11y.isInvalid}
      aria-required={isRequired || undefined}
      aria-describedby={a11y.describedBy}
    />
  );

  return (
    <FormGroup label={label} isRequired={isRequired} fieldId={a11y.fieldId}>
      {isPassword ? (
        <InputGroup>
          <InputGroupItem isFill>{input}</InputGroupItem>
          <InputGroupItem>
            <Button
              variant="control"
              aria-label={`${isRevealed ? 'Hide' : 'Show'} ${label}`}
              icon={isRevealed ? <EyeSlashIcon /> : <EyeIcon />}
              onClick={() => setIsRevealed((revealed) => !revealed)}
            />
          </InputGroupItem>
        </InputGroup>
      ) : (
        input
      )}
      <FieldHelperText id={a11y.helperId} error={fieldState.error} helperText={helperText} />
    </FormGroup>
  );
}
