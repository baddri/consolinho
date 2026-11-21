import { Alert, AlertActionLink } from '@patternfly/react-core';
import type { ComponentProps } from 'react';
import { Link } from 'react-router';
import type { Credential } from '@/shared/api';
import { useFleetCredentials } from './api';
import { NEEDS_ATTENTION_PATH } from './credentialFilters';

/** Expired and expiring-soon counts of the fleet, plus the server's "soon" window. */
interface ExpirySummary {
  expired: number;
  expiringSoon: number;
  /** `expiryWarningDays` of the expiring credentials; `null` when none expires soon. */
  warningDays: number | null;
}

/** Counts the credentials that need attention (CRED-8). */
function summarizeExpiry(credentials: readonly Credential[]): ExpirySummary {
  const expired = credentials.filter((c) => c.expiryStatus === 'expired').length;
  const soon = credentials.filter((c) => c.expiryStatus === 'expiringSoon');
  return { expired, expiringSoon: soon.length, warningDays: soon[0]?.expiryWarningDays ?? null };
}

/**
 * Alert title, pluralised: "2 credentials expired, 3 expire within 14 days", "1 credential expires within 14 days".
 * The noun goes on the first clause only.
 */
function expiryAlertTitle({ expired, expiringSoon, warningDays }: ExpirySummary): string {
  const noun = (count: number) => (count === 1 ? 'credential' : 'credentials');
  const within = warningDays === null ? 'soon' : `within ${warningDays} ${warningDays === 1 ? 'day' : 'days'}`;
  const soonVerb = expiringSoon === 1 ? 'expires' : 'expire';
  const parts: string[] = [];
  if (expired > 0) parts.push(`${expired} ${noun(expired)} expired`);
  if (expiringSoon > 0) {
    const subject = expired > 0 ? `${expiringSoon}` : `${expiringSoon} ${noun(expiringSoon)}`;
    parts.push(`${subject} ${soonVerb} ${within}`);
  }
  return parts.join(', ');
}

/** Router link for `AlertActionLink`'s `component` (keeps it a real `<a href>`, so middle-click works). */
function ReviewLink(props: ComponentProps<'a'>) {
  return <Link {...props} to={NEEDS_ATTENTION_PATH} />;
}

/**
 * Fleet-wide token expiry warning (CRED-8) shown on the Clusters and Credentials pages before tokens break. Uses the
 * shared fleet credentials query; renders nothing while loading, on error (the pages show their own) or when no
 * credential is expired or expiring soon. Danger when any token has expired, otherwise warning. "Review credentials"
 * opens `/admin/credentials` filtered to both statuses.
 */
export function CredentialExpiryAlert() {
  const { data } = useFleetCredentials();
  if (!data) return null;
  const summary = summarizeExpiry(data);
  if (summary.expired === 0 && summary.expiringSoon === 0) return null;
  return (
    <Alert
      variant={summary.expired > 0 ? 'danger' : 'warning'}
      isInline
      // The page's toolbar follows directly; keep the spacer--md gap between them.
      className="pf-v6-u-mb-md"
      title={expiryAlertTitle(summary)}
      actionLinks={<AlertActionLink component={ReviewLink}>Review credentials</AlertActionLink>}
    />
  );
}
