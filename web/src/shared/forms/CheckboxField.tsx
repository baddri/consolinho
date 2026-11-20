import { Checkbox, FormGroup, type CheckboxProps } from '@patternfly/react-core';
import { useController, type FieldPathByValue, type FieldValues } from 'react-hook-form';
import { fieldA11y, FieldHelperText, useWrapperFocusRef } from './fieldA11y';
import type { FieldBaseProps } from './types';

/** Checkbox props the adapter owns. */
type OwnedCheckboxProps =
  | 'isChecked'
  | 'checked'
  | 'defaultChecked'
  | 'onChange'
  | 'onBlur'
  | 'name'
  | 'id'
  | 'label'
  | 'isValid'
  | 'isRequired'
  | 'ref';

/** Props for {@link CheckboxField}. */
export type CheckboxFieldProps<
  T extends FieldValues,
  N extends FieldPathByValue<T, boolean | null | undefined>,
  TTransformed = T,
> = FieldBaseProps<T, N, TTransformed> & Omit<CheckboxProps, OwnedCheckboxProps>;

/**
 * Single checkbox bound to a boolean form value (e.g. "Skip TLS verification", an acknowledgement). Its label is the
 * accessible name; `description` (PatternFly) can add a sub-line, `helperText` behaves as in the other adapters.
 * Unlike the text adapters, `isRequired` also sets native `required` on the input; forms use `<Form noValidate>`.
 */
export function CheckboxField<
  T extends FieldValues,
  N extends FieldPathByValue<T, boolean | null | undefined>,
  TTransformed = T,
>({ control, name, label, isRequired = false, helperText, ...checkboxProps }: CheckboxFieldProps<T, N, TTransformed>) {
  const { field, fieldState } = useController({ control, name });
  const a11y = fieldA11y(name, fieldState.error, helperText);
  const focusRef = useWrapperFocusRef(field.ref);

  return (
    <FormGroup fieldId={a11y.fieldId}>
      <div ref={focusRef}>
        <Checkbox
          {...checkboxProps}
          id={a11y.fieldId}
          name={field.name}
          label={label}
          isChecked={field.value === true}
          onChange={(_event, checked) => field.onChange(checked)}
          onBlur={field.onBlur}
          isDisabled={checkboxProps.isDisabled ?? field.disabled}
          isValid={!a11y.isInvalid}
          // PF renders native `required` (plus its asterisk) from this; `<Form noValidate>` keeps zod authoritative.
          isRequired={isRequired}
          aria-describedby={a11y.describedBy}
        />
      </div>
      <FieldHelperText id={a11y.helperId} error={fieldState.error} helperText={helperText} />
    </FormGroup>
  );
}
