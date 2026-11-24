import { Button, FormGroup, NumberInput } from '@patternfly/react-core';
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { useController } from 'react-hook-form';
import { CheckboxField, FieldHelperText, fieldA11y } from '@/shared/forms';
import { DeploymentFormSection, type DeploymentSectionProps } from './DeploymentFormSection';
import styles from './EditDeployment.module.css';

/** "Pause rollouts" (OCP `PauseRolloutsSection`): `spec.paused`. */
function PauseRolloutsSection({ control }: DeploymentSectionProps) {
  return (
    <DeploymentFormSection title="Pause rollouts">
      <CheckboxField
        control={control}
        name="paused"
        label="Pause rollouts for this deployment"
        helperText="Pausing lets you make changes without triggering a rollout. You can resume rollouts at any time."
      />
    </DeploymentFormSection>
  );
}

/** Parses the replicas input; empty or garbage counts as 0, like OCP's `NumberSpinnerField` (`_.toInteger`). */
function toReplicas(text: string): number {
  const count = Number.parseInt(text, 10);
  return Number.isNaN(count) ? 0 : Math.max(count, 0);
}

/** "Scaling" (OCP `ScalingSection`): a Replicas spinner (PF `NumberInput`, minimum 0) bound to `spec.replicas`. */
function ScalingSection({ control }: DeploymentSectionProps) {
  const { field, fieldState } = useController({ control, name: 'replicas' });
  const helperText = 'The number of instances of your Image.';
  const a11y = fieldA11y(field.name, fieldState.error, helperText);
  const value = field.value;
  return (
    <DeploymentFormSection title="Scaling" subTitle="Replicas are scaled manually based on CPU usage.">
      <FormGroup label="Replicas" fieldId={a11y.fieldId}>
        <NumberInput
          value={value}
          min={0}
          inputName={field.name}
          inputAriaLabel="Replicas"
          minusBtnAriaLabel="Decrement"
          plusBtnAriaLabel="Increment"
          inputProps={{ id: a11y.fieldId, 'aria-describedby': a11y.describedBy, onBlur: field.onBlur }}
          isDisabled={field.disabled}
          validated={a11y.isInvalid ? 'error' : 'default'}
          onMinus={() => field.onChange(Math.max(value - 1, 0))}
          onPlus={() => field.onChange(value + 1)}
          onChange={(event) => field.onChange(toReplicas(event.currentTarget.value))}
        />
        <FieldHelperText id={a11y.helperId} error={fieldState.error} helperText={helperText} />
      </FormGroup>
    </DeploymentFormSection>
  );
}

/** One revealed option (OCP `ProgressiveListItem`): scrolls itself smoothly into view when it appears. */
function ProgressiveListItem({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);
  return (
    <div ref={ref} className={styles.progressiveItem}>
      {children}
    </div>
  );
}

/** The advanced options in OCP's order; each is shown once its name is clicked. */
const ITEMS: { name: string; Section: (props: DeploymentSectionProps) => ReactNode }[] = [
  { name: 'Pause rollouts', Section: PauseRolloutsSection },
  { name: 'Scaling', Section: ScalingSection },
];

const listFormat = new Intl.ListFormat('en', { style: 'long', type: 'conjunction' });

/**
 * "Advanced options" (OCP `AdvancedSection` + `ProgressiveList`): a full-width section listing the hidden options as
 * inline link buttons — "Click on the names to access advanced options for Pause rollouts and Scaling." — and showing
 * each option's section, in the order clicked, once its name is clicked. The footer goes when nothing is left.
 * Values of hidden options stay in the form, so they are saved either way.
 */
export function AdvancedSection({ control }: DeploymentSectionProps) {
  const [visible, setVisible] = useState<string[]>([]);
  const hidden = ITEMS.filter((item) => !visible.includes(item.name)).map((item) => item.name);
  // The separators ("," / "and") come from Intl like OCP's footer; each name part becomes a link.
  const parts = listFormat.formatToParts(hidden);

  return (
    <DeploymentFormSection title="Advanced options" fullWidth>
      {/* One block like OCP's `ProgressiveList`, so only the item margin separates items and the footer. */}
      <div>
        {visible.map((name) => {
          const item = ITEMS.find((candidate) => candidate.name === name);
          return (
            item && (
              <ProgressiveListItem key={name}>
                <item.Section control={control} />
              </ProgressiveListItem>
            )
          );
        })}
        {hidden.length > 0 && (
          <div>
            Click on the names to access advanced options for{' '}
            {parts.map((part, index) =>
              part.type === 'element' ? (
                <Button
                  key={part.value}
                  variant="link"
                  isInline
                  onClick={() => setVisible([...visible, part.value])}
                >
                  {part.value}
                </Button>
              ) : (
                <Fragment key={`literal-${index}`}>{part.value}</Fragment>
              ),
            )}
            .
          </div>
        )}
      </div>
    </DeploymentFormSection>
  );
}
