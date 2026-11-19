import { FormHelperText, HelperText, HelperTextItem } from '@patternfly/react-core';
import { useCallback, type ReactNode } from 'react';
import type { FieldError, RefCallBack } from 'react-hook-form';

/**
 * Stable DOM id for a form field, derived from its RHF path (`items.1.credentialId` → `field-items-1-credentialId`)
 * so labels, helper text and server-error focus all agree without per-form id bookkeeping.
 */
export function fieldIdFor(name: string): string {
  return `field-${name.replace(/[^A-Za-z0-9_-]/g, '-')}`;
}

/** Ids and ARIA attributes shared by all field adapters. */
export interface FieldA11y {
  fieldId: string;
  helperId: string;
  isInvalid: boolean;
  /** Spread onto the control: links it to the helper/error text and flags it invalid. */
  describedBy: string | undefined;
}

/** Computes the {@link FieldA11y} of a field from its path, current error and optional helper text. */
export function fieldA11y(name: string, error: FieldError | undefined, helperText: ReactNode): FieldA11y {
  const fieldId = fieldIdFor(name);
  const helperId = `${fieldId}-helper`;
  const isInvalid = error !== undefined;
  const hasHelper = isInvalid || (helperText !== undefined && helperText !== null && helperText !== '');
  return { fieldId, helperId, isInvalid, describedBy: hasHelper ? helperId : undefined };
}

/** Props for {@link FieldHelperText}. */
export interface FieldHelperTextProps {
  id: string;
  error: FieldError | undefined;
  helperText?: ReactNode;
}

/**
 * Helper text under a field: the validation error (PatternFly `error` variant) when invalid, otherwise the static
 * helper text. Rendered with the `id` the control points at via `aria-describedby`.
 */
export function FieldHelperText({ id, error, helperText }: FieldHelperTextProps) {
  if (error === undefined && (helperText === undefined || helperText === null || helperText === '')) {
    return null;
  }
  return (
    <FormHelperText>
      <HelperText>
        {error !== undefined ? (
          <HelperTextItem id={id} variant="error">
            {error.message}
          </HelperTextItem>
        ) : (
          <HelperTextItem id={id}>{helperText}</HelperTextItem>
        )}
      </HelperText>
    </FormHelperText>
  );
}

/**
 * Lets react-hook-form focus a PatternFly control that does not forward refs (FormSelect, Checkbox, Radio and Switch
 * are class components, so `ref` yields the component instance, not the input). Returns a callback ref for a wrapper
 * element owned by the adapter; RHF's `shouldFocus` then focuses the checked radio, else the first form control
 * inside that wrapper. The
 * lookup is scoped to the adapter's own subtree, never the document.
 */
export function useWrapperFocusRef(fieldRef: RefCallBack): (wrapper: HTMLDivElement | null) => void {
  return useCallback(
    (wrapper: HTMLDivElement | null) => {
      if (wrapper === null) {
        return;
      }
      fieldRef({
        // A selector list matches in document order, so the checked radio is looked up first on its own.
        focus: () =>
          (
            wrapper.querySelector<HTMLElement>('input:checked') ??
            wrapper.querySelector<HTMLElement>('input, select, textarea')
          )?.focus(),
      });
    },
    [fieldRef],
  );
}
