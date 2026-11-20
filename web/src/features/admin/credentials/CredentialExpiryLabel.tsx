import { Flex, FlexItem, Label, type LabelProps } from '@patternfly/react-core';
import type { Credential, CredentialExpiryStatus } from '@/shared/api';
import { RelativeTime } from '@/shared/ui';

/** Label text and PatternFly status/colour of each expiry status (CRED-4). */
const EXPIRY_LABELS: Record<CredentialExpiryStatus, { text: string } & Pick<LabelProps, 'status' | 'color'>> = {
  ok: { text: 'Valid', status: 'success' },
  expiringSoon: { text: 'Expires soon', status: 'warning' },
  expired: { text: 'Expired', status: 'danger' },
  noExpiry: { text: 'No expiry', color: 'grey' },
  unknown: { text: 'Unknown', color: 'grey' },
};

/** Props for {@link CredentialExpiryLabel}. */
export type CredentialExpiryLabelProps = Pick<Credential, 'expiryStatus' | 'expiresAt'>;

/**
 * Token expiry of a credential (CRED-4): a compact label — Valid (green), Expires soon (warning), Expired (danger),
 * No expiry / Unknown (grey) — followed by the expiry date as `RelativeTime` ("in 5 days", absolute in a tooltip)
 * whenever the token has one. The server computes the status with its warning window (`expiryWarningDays`).
 */
export function CredentialExpiryLabel({ expiryStatus, expiresAt }: CredentialExpiryLabelProps) {
  const { text, status, color } = EXPIRY_LABELS[expiryStatus];
  return (
    <Flex spaceItems={{ default: 'spaceItemsSm' }} alignItems={{ default: 'alignItemsCenter' }}>
      <FlexItem>
        <Label isCompact status={status} color={color}>
          {text}
        </Label>
      </FlexItem>
      {expiresAt !== null && (
        <FlexItem>
          <RelativeTime value={expiresAt} />
        </FlexItem>
      )}
    </Flex>
  );
}
