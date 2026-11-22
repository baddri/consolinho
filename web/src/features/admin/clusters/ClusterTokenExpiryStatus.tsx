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

/**
 * Status, text and tooltip per expiry status, worst first (expired > expiringSoon > unknown > …); icons as OCP
 * `Status.tsx` maps the words (Expired → ban, Expires soon → warning, Unknown → unknown, Valid → green check).
 */
const TOKEN_EXPIRY: Record<CredentialExpiryStatus, ExpiryPresentation> = {
  expired: { status: 'ban', text: 'Expired', description: 'A credential token has expired' },
  expiringSoon: { status: 'warning', text: 'Expires soon', description: 'A credential token expires soon' },
  unknown: { status: 'unknown', text: 'Unknown expiry', description: 'A credential token has an unknown expiry' },
  noExpiry: { status: 'neutral', text: 'No expiry', description: 'Credential tokens never expire' },
  ok: { status: 'success', text: 'Valid', description: 'All credential tokens are valid' },
};

/** Props for {@link ClusterTokenExpiryStatus}. */
export interface ClusterTokenExpiryStatusProps {
  /** The most severe expiry among the cluster's credentials (`worstCredentialExpiryStatus`); `null` = none. */
  status: CredentialExpiryStatus | null;
}

/**
 * Token expiry of a cluster's credentials (CLU-7): the most severe one as icon + text (`UX.md` §5), e.g. "Expires
 * soon", with the full meaning in a tooltip (focusable trigger for keyboard users). Renders nothing when the cluster
 * has no credentials.
 */
export function ClusterTokenExpiryStatus({ status }: ClusterTokenExpiryStatusProps) {
  if (status === null) return null;
  const { status: kind, text, description } = TOKEN_EXPIRY[status];
  return (
    <Tooltip content={description}>
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
      <span tabIndex={0}>
        <StatusIconText status={kind} text={text} />
      </span>
    </Tooltip>
  );
}
