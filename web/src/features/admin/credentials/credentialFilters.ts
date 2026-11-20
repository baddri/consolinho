import type { ClusterEnvironment, Credential, CredentialExpiryStatus } from '@/shared/api';
import { matchesText, type FilterDefs, type FilterOption, type FilterValues } from '@/shared/table';

const ENVIRONMENTS: readonly ClusterEnvironment[] = ['production', 'staging', 'development'];
const EXPIRY_STATUSES: readonly CredentialExpiryStatus[] = ['expired', 'expiringSoon', 'unknown', 'noExpiry', 'ok'];

/**
 * URL filters of `/admin/credentials` (`?q=&expiry=&env=`): `q` searches cluster, credential name and service
 * account; `expiry` and `env` are multi-selects, so the CRED-8 alert can deep-link to
 * `?expiry=expired&expiry=expiringSoon`.
 */
export const CREDENTIAL_FILTERS = {
  q: { kind: 'text' },
  expiry: { kind: 'multi', values: EXPIRY_STATUSES },
  env: { kind: 'multi', values: ENVIRONMENTS },
} as const satisfies FilterDefs;

/** Current values of {@link CREDENTIAL_FILTERS}. */
export type CredentialFilterValues = FilterValues<typeof CREDENTIAL_FILTERS>;

/** Options of the expiry filter, labelled like `CredentialExpiryLabel`. */
export const EXPIRY_OPTIONS: FilterOption[] = [
  { value: 'expired', label: 'Expired' },
  { value: 'expiringSoon', label: 'Expires soon' },
  { value: 'unknown', label: 'Unknown' },
  { value: 'noExpiry', label: 'No expiry' },
  { value: 'ok', label: 'Valid' },
];

/** Fleet credentials page pre-filtered to the credentials that need attention (CRED-8). */
export const NEEDS_ATTENTION_PATH = '/admin/credentials?expiry=expired&expiry=expiringSoon';

/** True when `credential` passes every applied filter (an empty multi filter means "any"). */
export function matchesCredentialFilters(credential: Credential, filters: CredentialFilterValues): boolean {
  return (
    matchesText(
      filters.q ?? '',
      credential.clusterName,
      credential.clusterDisplayName,
      credential.name,
      credential.serviceAccount,
      credential.subject,
    ) &&
    (filters.expiry.length === 0 || filters.expiry.includes(credential.expiryStatus)) &&
    (filters.env.length === 0 || filters.env.includes(credential.clusterEnvironment))
  );
}
