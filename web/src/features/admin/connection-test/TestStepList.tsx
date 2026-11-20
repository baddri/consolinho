import { Icon, List, ListItem } from '@patternfly/react-core';
import {
  CheckCircleIcon,
  ExclamationCircleIcon,
  ExclamationTriangleIcon,
  MinusCircleIcon,
} from '@patternfly/react-icons';
import type { ComponentType } from 'react';
import type { ConnectionTestStepResult, ConnectionTestStepStatus } from '@/shared/api';
import { TEST_STEP_LABELS } from '../credentials/LastTestLabel';

interface StepPresentation {
  icon: ComponentType;
  /** PatternFly `Icon` status colour; skipped steps stay neutral. */
  status?: 'success' | 'warning' | 'danger';
  /** Accessible name of the icon. */
  text: string;
}

/** Icon, colour and accessible text of each step status (TEST-2). */
const STEP_STATUS: Record<ConnectionTestStepStatus, StepPresentation> = {
  passed: { icon: CheckCircleIcon, status: 'success', text: 'Passed' },
  warning: { icon: ExclamationTriangleIcon, status: 'warning', text: 'Warning' },
  failed: { icon: ExclamationCircleIcon, status: 'danger', text: 'Failed' },
  skipped: { icon: MinusCircleIcon, text: 'Skipped' },
};

/**
 * The connection test's steps in the order received (reachability → capabilities, TEST-2): a status icon with an
 * accessible name, the step title and the server's `message` verbatim (e.g. the TLS unknown-authority explanation).
 */
export function TestStepList({ steps }: { steps: readonly ConnectionTestStepResult[] }) {
  return (
    <List isPlain aria-label="Test steps">
      {steps.map(({ step, status, message }) => {
        const { icon: StatusIcon, status: iconStatus, text } = STEP_STATUS[status];
        return (
          <ListItem
            key={step}
            icon={
              <Icon isInline status={iconStatus} role="img" aria-label={text}>
                <StatusIcon />
              </Icon>
            }
          >
            <strong>{TEST_STEP_LABELS[step]}</strong>
            {`: ${message}`}
          </ListItem>
        );
      })}
    </List>
  );
}
