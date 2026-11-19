import { FormGroup, Switch, type SwitchProps } from '@patternfly/react-core';
import { useController, type FieldPathByValue, type FieldValues } from 'react-hook-form';
import { fieldA11y, FieldHelperText, useWrapperFocusRef } from './fieldA11y';
import type { FieldBaseProps } from './types';

/** Switch props the adapter owns. */
type OwnedSwitchProps = 'isChecked' | 'defaultChecked' | 'onChange' | 'onBlur' | 'name' | 'id' | 'label' | 'ref';

/** Props for {@link SwitchField}. */
export type SwitchFieldProps<
  T extends FieldValues,
  N extends FieldPathByValue<T, boolean | null | undefined>,
  TTransformed = T,
> = FieldBaseProps<T, N, TTransformed> & Omit<SwitchProps, OwnedSwitchProps>;

/**
 * On/off setting bound to a boolean form value (e.g. "Enabled", "Read-only"). The switch's own label is its accessible
 * name; the form group has no separate label so the text is not announced twice.
 */
export function SwitchField<
  T extends FieldValues,
  N extends FieldPathByValue<T, boolean | null | undefined>,
  TTransformed = T,
>({ control, name, label, isRequired = false, helperText, ...switchProps }: SwitchFieldProps<T, N, TTransformed>) {
  const { field, fieldState } = useController({ control, name });
  const a11y = fieldA11y(name, fieldState.error, helperText);
  const focusRef = useWrapperFocusRef(field.ref);

  return (
    <FormGroup fieldId={a11y.fieldId}>
      <div ref={focusRef}>
        <Switch
          {...switchProps}
          id={a11y.fieldId}
          name={field.name}
          label={label}
          isChecked={field.value === true}
          onChange={(_event, checked) => field.onChange(checked)}
          onBlur={field.onBlur}
          isDisabled={switchProps.isDisabled ?? field.disabled}
          aria-invalid={a11y.isInvalid}
          aria-required={isRequired || undefined}
          aria-describedby={a11y.describedBy}
        />
      </div>
      <FieldHelperText id={a11y.helperId} error={fieldState.error} helperText={helperText} />
    </FormGroup>
  );
}
