import { useCallback, useEffect, useRef, useState, type BaseSyntheticEvent } from 'react';
import type { FieldValues, UseFormReturn } from 'react-hook-form';
import { applyServerErrors, type ApplyServerErrorsOptions, type FormProblem } from './applyServerErrors';

/** Result of {@link useFormProblem}. */
export interface FormProblemState<TTransformed> {
  /** What `applyServerErrors` left over; pass to `ConflictAlert` and `FormProblemAlert`. */
  problem: FormProblem | null;
  /**
   * Like `form.handleSubmit`: clears the previous problem, validates, awaits `onValid` and maps a rejection with
   * `applyServerErrors`. Never rethrows: the error is shown on fields or in the alerts.
   */
  handleSubmit: (
    onValid: (values: TTransformed) => Promise<unknown>,
  ) => (event?: BaseSyntheticEvent) => Promise<void>;
  /** Clears the alert, e.g. after "Reload latest values" has reset the form. */
  clearProblem: () => void;
}

/**
 * The submit pattern every CP1 form uses (ADR-0015 §4-5), so no form hand-writes the try/catch or forgets to clear a
 * stale alert:
 *
 * ```tsx
 * const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues });
 * const { problem, handleSubmit, clearProblem } = useFormProblem(form, { codeToField: { 'Clusters.NameTaken': 'name' } });
 * <Form noValidate onSubmit={(e) => void handleSubmit((v) => mutation.mutateAsync(v))(e)}>
 *   <ConflictAlert problem={problem} onReload={reload} />
 *   <FormProblemAlert problem={problem} />
 * ```
 *
 * The form **must** be `<Form noValidate>`. Otherwise native constraint validation (PF `Checkbox` sets `required`,
 * `type="url"`/`"email"` inputs) blocks the submit event before zod and server errors can be shown.
 * `options` is read when the submit runs, so inline object literals need no memoising.
 */
export function useFormProblem<T extends FieldValues, TTransformed = T>(
  form: UseFormReturn<T, unknown, TTransformed>,
  options?: ApplyServerErrorsOptions<T>,
): FormProblemState<TTransformed> {
  const [problem, setProblem] = useState<FormProblem | null>(null);
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });

  const handleSubmit = useCallback(
    (onValid: (values: TTransformed) => Promise<unknown>) => {
      const submit = form.handleSubmit(async (values) => {
        try {
          await onValid(values);
        } catch (error) {
          setProblem(applyServerErrors(error, form, optionsRef.current));
        }
      });
      return (event?: BaseSyntheticEvent) => {
        // Cleared before validation too, so a client error on resubmit never sits under a stale server alert.
        setProblem(null);
        return submit(event);
      };
    },
    [form],
  );

  const clearProblem = useCallback(() => setProblem(null), []);

  return { problem, handleSubmit, clearProblem };
}
