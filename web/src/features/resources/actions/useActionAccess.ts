import { disabledActionProps, type DisabledActionProps } from '@/shared/ui';
import { useResourceAccess, type ResourceAccessReview } from './useResourceAccess';

/**
 * Menu-item props of one mutating action (ACT-4, UI-9): aria-disabled without a tooltip while the answer is pending,
 * aria-disabled with the first applicable reason (read-only user, read-only grant, cluster RBAC) when denied, `{}`
 * when allowed. `reviewByName: false` drops the name so every list row of a namespace shares one review (ADR-0022 §9).
 * Items stay visible; their `onClick` must do nothing while `isAriaDisabled` is set. `enabled: false` skips the
 * review for items that are never shown (the common items of a `readOnly` kind).
 */
export function useActionAccess(
  cluster: string,
  review: ResourceAccessReview,
  reviewByName: boolean,
  enabled = true,
): DisabledActionProps {
  const access = useResourceAccess(cluster, reviewByName ? review : { ...review, name: undefined }, {
    enabled,
  });
  // While checking there is no reason to give yet, so no tooltip.
  return access.isChecking ? { isAriaDisabled: true } : disabledActionProps(access.disabledReason);
}
