import { Alert, AlertActionLink } from '@patternfly/react-core';
import type { FormProblem } from './applyServerErrors';

/** Props for {@link ConflictAlert}. */
export interface ConflictAlertProps {
  /** Result of `applyServerErrors`; renders only when `problem.isConflict`. */
  problem: FormProblem | null;
  /** Refetches the entity and `reset()`s the form to the server values (the caller's job). */
  onReload: () => void;
  /** The refetch is running: the action shows a spinner and is disabled. */
  isReloading?: boolean;
}

/**
 * Inline danger alert for a stale edit (ADM-4, ADR-0015 §5): shows the server's `detail` ("This user was changed by
 * someone else. Reload and try again.") and a "Reload latest values" action. Reloading is always the user's choice —
 * the typed input stays in the form until they click it.
 */
export function ConflictAlert({ problem, onReload, isReloading = false }: ConflictAlertProps) {
  if (problem?.isConflict !== true) {
    return null;
  }
  return (
    <Alert
      variant="danger"
      isInline
      title={problem.detail ?? 'This item was changed by someone else. Reload and try again.'}
      actionLinks={
        <AlertActionLink onClick={onReload} isDisabled={isReloading} isLoading={isReloading}>
          Reload latest values
        </AlertActionLink>
      }
    />
  );
}
