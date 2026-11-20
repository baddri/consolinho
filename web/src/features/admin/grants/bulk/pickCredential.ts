import type { Credential } from '@/shared/api';

/**
 * The credential the bulk grant review pre-selects for one cluster (GRANT-4): the cluster's only credential, else the
 * one named exactly `preferredName` (surrounding blanks ignored, e.g. `fleet-view`), else none — the admin then picks
 * one. Never guesses between several credentials.
 */
export function pickCredential(
  credentials: readonly Pick<Credential, 'id' | 'name'>[],
  preferredName: string,
): string | undefined {
  const [only] = credentials;
  if (credentials.length === 1 && only !== undefined) return only.id;
  const name = preferredName.trim();
  if (name === '') return undefined;
  return credentials.find((credential) => credential.name === name)?.id;
}
