import { Icon, Tooltip } from '@patternfly/react-core';
import {
  CheckCircleIcon,
  ExclamationCircleIcon,
  ExclamationTriangleIcon,
  InfoCircleIcon,
  QuestionCircleIcon,
} from '@patternfly/react-icons';
import type { ComponentType } from 'react';
import type { CredentialExpiryStatus } from '@/shared/api';

interface ExpiryPresentation {
  icon: ComponentType;
  status: 'success' | 'info' | 'warning' | 'danger';
  text: string;
}

/** Icon, colour and tooltip of each worst-expiry status (worst first: expired > expiringSoon > unknown > …). */
export const WORST_EXPIRY: Record<CredentialExpiryStatus, ExpiryPresentation> = {
  expired: { icon: ExclamationCircleIcon, status: 'danger', text: 'A credential token has expired' },
  expiringSoon: { icon: ExclamationTriangleIcon, status: 'warning', text: 'A credential token expires soon' },
  unknown: { icon: QuestionCircleIcon, status: 'warning', text: 'A credential token has an unknown expiry' },
  noExpiry: { icon: InfoCircleIcon, status: 'info', text: 'Credential tokens never expire' },
  ok: { icon: CheckCircleIcon, status: 'success', text: 'All credential tokens are valid' },
};

/**
 * Status icon of the most severe token expiry among a cluster's credentials (CLU-7), with the meaning in a tooltip
 * and as the accessible name. Renders nothing for `null` (the cluster has no credentials).
 */
export function WorstExpiryIcon({ status }: { status: CredentialExpiryStatus | null }) {
  if (status === null) return null;
  const { icon: StatusIcon, status: iconStatus, text } = WORST_EXPIRY[status];
  return (
    <Tooltip content={text}>
      <Icon isInline status={iconStatus} role="img" aria-label={text} tabIndex={0}>
        <StatusIcon />
      </Icon>
    </Tooltip>
  );
}
