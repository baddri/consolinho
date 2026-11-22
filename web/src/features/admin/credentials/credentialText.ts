/** "1 user is affected." / "3 users are affected." — how many grants a token change or delete touches (CRED-5/6). */
export function affectedUsersText(grantCount: number): string {
  return grantCount === 1 ? '1 user is affected.' : `${grantCount} users are affected.`;
}

/** Toast title when an action hits a credential deleted meanwhile (404). */
export const credentialGoneTitle = (credential: string, cluster: string) =>
  `Credential ${credential} no longer exists on ${cluster}`;

/** The namespaces a credential's tests inspect (NST-6), comma-separated; `—` when the saved list is empty. */
export function formatInspectNamespaces(namespaces: readonly string[]): string {
  return namespaces.length === 0 ? '—' : namespaces.join(', ');
}
