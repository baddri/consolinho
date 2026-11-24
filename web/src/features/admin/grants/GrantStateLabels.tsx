import { Label, LabelGroup } from '@patternfly/react-core';
import type { Grant } from '@/shared/api';

/** Props for {@link GrantStateLabels}. */
export type GrantStateLabelsProps = Pick<Grant, 'clusterIsEnabled' | 'credentialExpiryStatus' | 'userStatus'>;

/**
 * Why a kept grant currently gives no access (GRANT-5): "Cluster disabled", "Credential expired" and "User
 * deactivated" as compact warning labels. Grants survive these states, so the table must say they are dormant.
 * Renders nothing for a working grant.
 */
export function GrantStateLabels({
  clusterIsEnabled,
  credentialExpiryStatus,
  userStatus,
}: GrantStateLabelsProps) {
  const states = [
    !clusterIsEnabled && 'Cluster disabled',
    credentialExpiryStatus === 'expired' && 'Credential expired',
    userStatus === 'deactivated' && 'User deactivated',
  ].filter((state): state is string => state !== false);
  if (states.length === 0) return null;
  return (
    <LabelGroup aria-label="Grant state" numLabels={states.length}>
      {states.map((state) => (
        <Label key={state} isCompact status="warning">
          {state}
        </Label>
      ))}
    </LabelGroup>
  );
}
