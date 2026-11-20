/**
 * Client-side search for admin lists: true when `query` (trimmed) is a case-insensitive substring of any field.
 * An empty query matches every row; missing fields never match.
 *
 * @example rows.filter((u) => matchesText(values.q ?? '', u.username, u.displayName, u.email))
 */
export function matchesText(query: string, ...fields: (string | null | undefined)[]): boolean {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return true;
  return fields.some((field) => field?.toLocaleLowerCase().includes(needle) ?? false);
}
