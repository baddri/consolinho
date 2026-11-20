/**
 * react-hook-form ⇄ PatternFly field adapters, server-error mapping and form alerts (ADR-0015). Every CP1 form uses
 * these so client and server validation look the same everywhere and version conflicts never lose input.
 *
 * Rules for forms built on this module:
 * - Render `<Form noValidate>`. Native constraint validation (PF `Checkbox` sets `required`, `type="url"`/`"email"`
 *   inputs) would otherwise block the submit before zod and server errors are shown.
 * - Give every field a default value (see `applyServerErrors`).
 * - Submit through `useFormProblem` and render `ConflictAlert` + `FormProblemAlert` with its `problem`.
 */
export {
  applyServerErrors,
  CONCURRENCY_CONFLICT_CODE,
  toFormPath,
  type ApplyServerErrorsOptions,
  type FormProblem,
} from './applyServerErrors';
export { CheckboxField, type CheckboxFieldProps } from './CheckboxField';
export { ConflictAlert, type ConflictAlertProps } from './ConflictAlert';
export { dnsLabel, type DnsLabelOptions } from './dnsLabel';
export { fieldIdFor } from './fieldA11y';
export { FileUploadField, type FileUploadAccept, type FileUploadFieldProps } from './FileUploadField';
export { FormProblemAlert, type FormProblemAlertProps } from './FormProblemAlert';
export { RadioGroupField, type RadioGroupFieldOption, type RadioGroupFieldProps } from './RadioGroupField';
export { SelectField, type SelectFieldOption, type SelectFieldProps } from './SelectField';
export { SwitchField, type SwitchFieldProps } from './SwitchField';
export { TextAreaField, type TextAreaFieldProps } from './TextAreaField';
export { TextField, type TextFieldProps } from './TextField';
export { useFormProblem, type FormProblemState } from './useFormProblem';
export type { FieldBaseProps } from './types';
