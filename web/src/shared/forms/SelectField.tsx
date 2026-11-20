import { FormGroup, FormSelect, FormSelectOption, type FormSelectProps } from '@patternfly/react-core';
import { useController, type FieldPathByValue, type FieldValues } from 'react-hook-form';
import { fieldA11y, FieldHelperText, useWrapperFocusRef } from './fieldA11y';
import type { FieldBaseProps } from './types';

/** One option of a {@link SelectField}. */
export interface SelectFieldOption {
  value: string;
  label: string;
  isDisabled?: boolean;
}

/** FormSelect props the adapter owns. */
type OwnedSelectProps =
  | 'value'
  | 'onChange'
  | 'onBlur'
  | 'name'
  | 'id'
  | 'validated'
  | 'isRequired'
  | 'label'
  | 'children'
  | 'ref';

/** Props for {@link SelectField}. */
export type SelectFieldProps<
  T extends FieldValues,
  N extends FieldPathByValue<T, string | null | undefined>,
  TTransformed = T,
> = FieldBaseProps<T, N, TTransformed> &
  Omit<FormSelectProps, OwnedSelectProps> & {
    options: readonly SelectFieldOption[];
    /** Text of a leading, unselectable option shown while the value is `''` (e.g. "Select a credential"). */
    placeholder?: string;
  };

/**
 * Native PatternFly `FormSelect` bound to react-hook-form, for short fixed option lists (environment, access mode,
 * credential of a cluster). Values are strings; `null`/`undefined` select the placeholder.
 */
export function SelectField<
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
  placeholder,
  ...selectProps
}: SelectFieldProps<T, N, TTransformed>) {
  const { field, fieldState } = useController({ control, name });
  const a11y = fieldA11y(name, fieldState.error, helperText);
  const focusRef = useWrapperFocusRef(field.ref);

  return (
    <FormGroup label={label} isRequired={isRequired} fieldId={a11y.fieldId}>
      <div ref={focusRef}>
        <FormSelect
          {...selectProps}
          id={a11y.fieldId}
          name={field.name}
          value={typeof field.value === 'string' ? field.value : ''}
          onChange={(_event, value) => field.onChange(value)}
          onBlur={field.onBlur}
          isDisabled={selectProps.isDisabled ?? field.disabled}
          validated={a11y.isInvalid ? 'error' : 'default'}
          aria-invalid={a11y.isInvalid}
          aria-required={isRequired || undefined}
          aria-describedby={a11y.describedBy}
        >
          {placeholder !== undefined && <FormSelectOption value="" label={placeholder} isPlaceholder isDisabled />}
          {options.map((option) => (
            <FormSelectOption
              key={option.value}
              value={option.value}
              label={option.label}
              isDisabled={option.isDisabled}
            />
          ))}
        </FormSelect>
      </div>
      <FieldHelperText id={a11y.helperId} error={fieldState.error} helperText={helperText} />
    </FormGroup>
  );
}
