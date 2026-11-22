import { FormGroup, Radio } from '@patternfly/react-core';
import type { ReactNode } from 'react';
import { useController, type FieldPathByValue, type FieldValues } from 'react-hook-form';
import { fieldA11y, FieldHelperText, useWrapperFocusRef } from './fieldA11y';
import type { FieldBaseProps } from './types';

/** PF's inline group-control classes (the `FormGroup isInline` layout), applied to the radios' own wrapper. */
const INLINE_CONTROL_CLASS = 'pf-v6-c-form__group-control pf-m-inline';

/** One choice of a {@link RadioGroupField}. */
export interface RadioGroupFieldOption {
  value: string;
  /** Visible label; may include markup such as an `EnvironmentLabel`. */
  label: ReactNode;
  /** Sub-line under the label explaining the choice (e.g. what "Read-only" access allows). */
  description?: ReactNode;
  isDisabled?: boolean;
}

/** Props for {@link RadioGroupField}. */
export type RadioGroupFieldProps<
  T extends FieldValues,
  N extends FieldPathByValue<T, string | null | undefined>,
  TTransformed = T,
> = FieldBaseProps<T, N, TTransformed> & {
  options: readonly RadioGroupFieldOption[];
  /** Lays the radios out in a row instead of a stack. */
  isInline?: boolean;
  isDisabled?: boolean;
};

/**
 * Mutually exclusive choice among a few options with explanations (access mode, role). Renders a PatternFly
 * `FormGroup role="radiogroup"` labelled by `label`; each radio's id is `<fieldId>-<value>`.
 *
 * The radios sit in a wrapper that holds the focus ref (see `useWrapperFocusRef`). Inline mode gives that wrapper PF's
 * inline group-control layout instead of the `FormGroup`'s, so the radios form one row with PF's group gap and the
 * helper text goes on its own line below, as in OCP's inline `RadioGroupField`.
 */
export function RadioGroupField<
  T extends FieldValues,
  N extends FieldPathByValue<T, string | null | undefined>,
  TTransformed = T,
>({
  control,
  name,
  label,
  isRequired = false,
  helperText,
  options,
  isInline = false,
  isDisabled,
}: RadioGroupFieldProps<T, N, TTransformed>) {
  const { field, fieldState } = useController({ control, name });
  const a11y = fieldA11y(name, fieldState.error, helperText);
  const focusRef = useWrapperFocusRef(field.ref);

  return (
    <FormGroup
      role="radiogroup"
      label={label}
      isRequired={isRequired}
      fieldId={a11y.fieldId}
      isStack={!isInline}
      aria-invalid={a11y.isInvalid}
      aria-required={isRequired || undefined}
      aria-describedby={a11y.describedBy}
    >
      <div ref={focusRef} className={isInline ? INLINE_CONTROL_CLASS : undefined}>
        {options.map((option) => (
          <Radio
            key={option.value}
            id={`${a11y.fieldId}-${option.value}`}
            name={a11y.fieldId}
            value={option.value}
            label={option.label}
            description={option.description}
            isChecked={field.value === option.value}
            onChange={() => field.onChange(option.value)}
            onBlur={field.onBlur}
            isDisabled={option.isDisabled ?? isDisabled ?? field.disabled}
            isValid={!a11y.isInvalid}
          />
        ))}
      </div>
      <FieldHelperText id={a11y.helperId} error={fieldState.error} helperText={helperText} />
    </FormGroup>
  );
}
