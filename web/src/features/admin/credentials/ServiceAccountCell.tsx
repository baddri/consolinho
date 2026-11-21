import { Tooltip } from '@patternfly/react-core';
import type { Credential } from '@/shared/api';
import { StatusIconText } from '@/shared/ui';

/** Q10 warning shown for opaque (non-JWT) tokens, in the table and as the toast after adding/rotating one. */
export const OPAQUE_TOKEN_TITLE = 'Not a ServiceAccount token';

/** Why an opaque token deserves the warning (Q10). */
export const OPAQUE_TOKEN_DETAIL = "Expiry unknown and it is tied to a person's account.";

/** Props for {@link ServiceAccountCell}. */
export type ServiceAccountCellProps = Pick<Credential, 'tokenType' | 'serviceAccount' | 'subject'>;

/**
 * Identity behind a credential's token (CRED-3): `<namespace>/<name>` for a ServiceAccount JWT, the raw `sub` for a
 * JWT of another subject, and for an opaque token a warning (icon + "Not a ServiceAccount token", `UX.md` §5) whose
 * tooltip explains the risk (Q10). The warning is focusable so keyboard users reach the tooltip.
 */
export function ServiceAccountCell({ tokenType, serviceAccount, subject }: ServiceAccountCellProps) {
  if (tokenType === 'opaque') {
    return (
      <Tooltip content={OPAQUE_TOKEN_DETAIL}>
        {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
        <span tabIndex={0}>
          <StatusIconText status="warning" text={OPAQUE_TOKEN_TITLE} />
        </span>
      </Tooltip>
    );
  }
  return <>{serviceAccount ?? subject ?? '—'}</>;
}
