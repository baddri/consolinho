import { FormGroup, TextArea, type TextAreaProps } from '@patternfly/react-core';
import { useController, type FieldPathByValue, type FieldValues } from 'react-hook-form';
import { fieldA11y, FieldHelperText } from './fieldA11y';
import type { FieldBaseProps } from './types';

/** TextArea props the adapter owns. */
type OwnedTextAreaProps = 'value' | 'onChange' | 'onBlur' | 'name' | 'id' | 'validated' | 'isRequired' | 'label';

/** Props for {@link TextAreaField}: the common field props plus other `TextArea` props (`rows`, `resizeOrientation`, …). */
export type TextAreaFieldProps<
  T extends FieldValues,
  N extends FieldPathByValue<T, string | null | undefined>,
  TTransformed = T,
> = FieldBaseProps<T, N, TTransformed> & Omit<TextAreaProps, OwnedTextAreaProps>;

/** Multi-line text bound to react-hook-form (descriptions, CA bundles); same error display as {@link TextField}. */
export function TextAreaField<
  T extends FieldValues,
  N extends FieldPathByValue<T, string | null | undefined>,
  TTransformed = T,
>({ control, name, label, isRequired = false, helperText, ...areaProps }: TextAreaFieldProps<T, N, TTransformed>) {
  // Destructured so the React compiler lint sees `ref` as the only ref (it treats a whole object passed via `ref` as one).
  const {
    field: { ref, value, onChange, onBlur, name: fieldName, disabled },
    fieldState,
  } = useController({ control, name });
  const a11y = fieldA11y(name, fieldState.error, helperText);

  return (
    <FormGroup label={label} isRequired={isRequired} fieldId={a11y.fieldId}>
      <TextArea
        {...areaProps}
        ref={ref}
        id={a11y.fieldId}
        name={fieldName}
        value={typeof value === 'string' ? value : ''}
        onChange={(_event, text) => onChange(text)}
        onBlur={onBlur}
        isDisabled={areaProps.isDisabled ?? disabled}
        validated={a11y.isInvalid ? 'error' : 'default'}
        aria-invalid={a11y.isInvalid}
        aria-required={isRequired || undefined}
        aria-describedby={a11y.describedBy}
      />
      <FieldHelperText id={a11y.helperId} error={fieldState.error} helperText={helperText} />
    </FormGroup>
  );
}
