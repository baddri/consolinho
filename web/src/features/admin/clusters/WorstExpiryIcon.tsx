import { Tooltip } from '@patternfly/react-core';
import type { CredentialExpiryStatus } from '@/shared/api';
import { StatusIconText, type StatusKind } from '@/shared/ui';

interface ExpiryPresentation {
  status: StatusKind;
  /** Short cell text next to the count, e.g. "Expires soon". */
  text: string;
  /** The full meaning, shown in the tooltip. */
  description: string;
}

/** Status, text and tooltip of each worst-expiry status (worst first: expired > expiringSoon > unknown > …). */
export const WORST_EXPIRY: Record<CredentialExpiryStatus, ExpiryPresentation> = {
  expired: { status: 'danger', text: 'Expired', description: 'A credential token has expired' },
  expiringSoon: { status: 'warning', text: 'Expires soon', description: 'A credential token expires soon' },
  unknown: { status: 'warning', text: 'Unknown expiry', description: 'A credential token has an unknown expiry' },
  noExpiry: { status: 'info', text: 'No expiry', description: 'Credential tokens never expire' },
  ok: { status: 'success', text: 'Valid', description: 'All credential tokens are valid' },
};

/**
 * The most severe token expiry among a cluster's credentials (CLU-7) as icon + text (`UX.md` §5), e.g. "Expires
 * soon", with the full meaning in a tooltip (focusable trigger for keyboard users). Renders nothing for `null` (the
 * cluster has no credentials).
 */
export function WorstExpiryIcon({ status }: { status: CredentialExpiryStatus | null }) {
  if (status === null) return null;
  const { status: kind, text, description } = WORST_EXPIRY[status];
  return (
    <Tooltip content={description}>
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
      <span tabIndex={0}>
        <StatusIconText status={kind} text={text} />
      </span>
    </Tooltip>
  );
}
