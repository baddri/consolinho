import type { ReactNode } from 'react';
import type { Control, FieldPath, FieldValues } from 'react-hook-form';

/**
 * Props every field adapter takes. `TTransformed` is the resolver's output type (zod schemas with transforms), so
 * `control` from `useForm({ resolver: zodResolver(schema) })` fits without casts.
 */
export interface FieldBaseProps<T extends FieldValues, N extends FieldPath<T>, TTransformed = T> {
  control: Control<T, unknown, TTransformed>;
  /** RHF path of the value; also the source of the stable DOM id (`field-<path>`). */
  name: N;
  /** Visible label; the control's accessible name. */
  label: string;
  /**
   * Shows the required asterisk and sets `aria-required`; the zod schema does the actual check. Text-like adapters
   * don't set native `required`, but `CheckboxField` does (PF `Checkbox` always forwards it). Forms render
   * `<Form noValidate>`, which turns native validation off so zod and server messages are the only ones shown.
   */
  isRequired?: boolean;
  /** Shown under the control while it has no error. */
  helperText?: ReactNode;
}
