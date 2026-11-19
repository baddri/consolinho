import { Alert, List, ListItem } from '@patternfly/react-core';
import type { FormProblem } from './applyServerErrors';

/** Props for {@link FormProblemAlert}. */
export interface FormProblemAlertProps {
  /** Result of `applyServerErrors`; `null` renders nothing. */
  problem: FormProblem | null;
}

/**
 * Inline danger alert for the part of a failed submit that is not shown on a field (ADR-0015 §4): the server's
 * `detail` verbatim as heading and leftover field messages as a list. Version conflicts are left to
 * {@link ConflictAlert} (render both; each shows only its kind), so a conflict never appears twice.
 */
export function FormProblemAlert({ problem }: FormProblemAlertProps) {
  if (problem === null || problem.isConflict) {
    return null;
  }
  return (
    <Alert variant="danger" isInline title={problem.detail ?? problem.title}>
      {problem.messages.length > 0 && (
        <List>
          {problem.messages.map((message, index) => (
            // Messages may repeat (same rule on two unknown keys); position keeps keys unique.
            <ListItem key={`${index}-${message}`}>{message}</ListItem>
          ))}
        </List>
      )}
    </Alert>
  );
}
