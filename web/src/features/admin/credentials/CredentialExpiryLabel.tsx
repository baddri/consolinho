import { Flex, FlexItem } from '@patternfly/react-core';
import type { Credential, CredentialExpiryStatus } from '@/shared/api';
import { RelativeTime, StatusIconText, type StatusKind } from '@/shared/ui';

/** Text and status icon of each expiry status (CRED-4). */
const EXPIRY_LABELS: Record<CredentialExpiryStatus, { text: string; status: StatusKind }> = {
  ok: { text: 'Valid', status: 'success' },
  expiringSoon: { text: 'Expires soon', status: 'warning' },
  expired: { text: 'Expired', status: 'danger' },
  noExpiry: { text: 'No expiry', status: 'neutral' },
  unknown: { text: 'Unknown', status: 'neutral' },
};

/** Props for {@link CredentialExpiryLabel}. */
export type CredentialExpiryLabelProps = Pick<Credential, 'expiryStatus' | 'expiresAt'> & {
  /** Read `Badge` around icon + text — details-page headers only (`UX.md` §3). */
  asLabel?: boolean;
};

/**
 * Token expiry of a credential (CRED-4) as icon + text (`UX.md` §5) — Valid (green check), Expires soon (warning),
 * Expired (danger), No expiry / Unknown (plain text) — followed by the expiry date as `RelativeTime` ("in 5 days",
 * absolute in a tooltip) whenever the token has one. The server computes the status with its warning window
 * (`expiryWarningDays`).
 */
export function CredentialExpiryLabel({ expiryStatus, expiresAt, asLabel }: CredentialExpiryLabelProps) {
  const { text, status } = EXPIRY_LABELS[expiryStatus];
  return (
    <Flex spaceItems={{ default: 'spaceItemsSm' }} alignItems={{ default: 'alignItemsCenter' }}>
      <FlexItem>
        <StatusIconText status={status} text={text} asLabel={asLabel} />
      </FlexItem>
      {expiresAt !== null && (
        <FlexItem>
          <RelativeTime value={expiresAt} />
        </FlexItem>
      )}
    </Flex>
  );
}
