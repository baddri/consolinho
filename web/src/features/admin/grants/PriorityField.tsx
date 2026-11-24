import { FormGroup, FormHelperText, HelperText, HelperTextItem, NumberInput } from '@patternfly/react-core';
import { useController, type Control } from 'react-hook-form';
import { fieldA11y } from '@/shared/forms';
import type { GrantFormValues } from './grantForm.schema';
import { PRIORITY_HELPER_TEXT, priorityTakenText } from './grantText';

/** A priority another group grant on the cluster already holds. */
export interface UsedPriority {
  priority: number;
  groupName: string;
}

/** Props for {@link PriorityField}. */
export interface PriorityFieldProps {
  control: Control<GrantFormValues>;
  /** The cluster's other group grants' priorities (the edited grant excluded), highest first. */
  usedPriorities: readonly UsedPriority[];
}

const MIN_PRIORITY = 1;
const MAX_PRIORITY = 1000;

/** The typed text as a priority: `null` when empty or not a number (the schema then asks for one). */
function toPriority(text: string): number | null {
  if (text.trim() === '') return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

/** "Used on this cluster: 200 (platform), 50 (ghost-team)." or `undefined` when no group grant holds one. */
function usedText(used: readonly UsedPriority[]): string | undefined {
  if (used.length === 0) return undefined;
  return `Used on this cluster: ${used.map((item) => `${item.priority} (${item.groupName})`).join(', ')}.`;
}

/**
 * "Priority" of a group grant (UIG-3): a PF `NumberInput` (1–1000, empty until the admin picks one) with the
 * precedence rule and the cluster's used priorities as helper text. A used value shows the GRP-4 message as the
 * field error right away; the form blocks submitting it, and the Api's 409 lands here too. Paired with RHF via
 * `useController` like the deployment form's Replicas.
 */
export function PriorityField({ control, usedPriorities }: PriorityFieldProps) {
  const { field, fieldState } = useController({ control, name: 'priority' });
  const value = field.value;
  const holder = usedPriorities.find((used) => used.priority === value);
  const error = fieldState.error?.message ?? (holder && priorityTakenText(holder.priority, holder.groupName));
  const a11y = fieldA11y(
    field.name,
    error === undefined ? undefined : { type: 'priority', message: error },
    PRIORITY_HELPER_TEXT,
  );
  const used = usedText(usedPriorities);

  return (
    <FormGroup label="Priority" isRequired fieldId={a11y.fieldId}>
      <NumberInput
        value={value ?? ''}
        min={MIN_PRIORITY}
        max={MAX_PRIORITY}
        inputName={field.name}
        inputAriaLabel="Priority"
        minusBtnAriaLabel="Decrease priority"
        plusBtnAriaLabel="Increase priority"
        inputProps={{
          id: a11y.fieldId,
          'aria-describedby': a11y.describedBy,
          'aria-invalid': a11y.isInvalid,
          'aria-required': true,
          onBlur: field.onBlur,
          ref: field.ref,
        }}
        validated={a11y.isInvalid ? 'error' : 'default'}
        onMinus={() => field.onChange(Math.max((value ?? MIN_PRIORITY + 1) - 1, MIN_PRIORITY))}
        onPlus={() => field.onChange(Math.min((value ?? MIN_PRIORITY - 1) + 1, MAX_PRIORITY))}
        onChange={(event) => field.onChange(toPriority(event.currentTarget.value))}
      />
      <FormHelperText>
        <HelperText id={a11y.helperId}>
          {error !== undefined && <HelperTextItem variant="error">{error}</HelperTextItem>}
          <HelperTextItem>{PRIORITY_HELPER_TEXT}</HelperTextItem>
          {used !== undefined && <HelperTextItem>{used}</HelperTextItem>}
        </HelperText>
      </FormHelperText>
    </FormGroup>
  );
}
