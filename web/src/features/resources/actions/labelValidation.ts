import { z } from 'zod';

/**
 * Kubernetes metadata key and label value rules (apimachinery `validation.IsQualifiedName` / `IsValidLabelValue`),
 * checked before a labels or annotations PATCH so the user sees the problem on the field instead of a 422.
 */

/** `[A-Za-z0-9]([-A-Za-z0-9_.]*[A-Za-z0-9])?`: the name part of a key and every non-empty label value. */
const NAME_PART = /^[A-Za-z0-9]([-A-Za-z0-9_.]*[A-Za-z0-9])?$/;
/** RFC 1123 DNS subdomain: the optional `prefix/` of a key. */
const DNS_SUBDOMAIN = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?(\.[a-z0-9]([-a-z0-9]*[a-z0-9])?)*$/;
const NAME_MAX = 63;
const PREFIX_MAX = 253;
const NAME_RULE =
  "must be 63 characters or less, consist of alphanumeric characters, '-', '_' or '.', and start and end with an alphanumeric character";

/** Why `key` is not a valid label/annotation key (`[prefix/]name`), or `undefined` when it is. */
export function metadataKeyError(key: string): string | undefined {
  if (key === '') return 'Key is required.';
  const slash = key.indexOf('/');
  const prefix = slash === -1 ? undefined : key.slice(0, slash);
  const name = slash === -1 ? key : key.slice(slash + 1);
  if (prefix !== undefined && (prefix.length > PREFIX_MAX || !DNS_SUBDOMAIN.test(prefix))) {
    return `Key "${key}": the prefix must be a lowercase DNS subdomain of 253 characters or less.`;
  }
  if (name.length > NAME_MAX || !NAME_PART.test(name)) return `Key "${key}": the name ${NAME_RULE}.`;
  return undefined;
}

/** Why `value` is not a valid label value (empty is valid), or `undefined` when it is. */
export function labelValueError(value: string): string | undefined {
  if (value === '' || (value.length <= NAME_MAX && NAME_PART.test(value))) return undefined;
  return `Value "${value}" ${NAME_RULE}.`;
}

/** One `key=value` entry of the labels input; `key` alone means an empty value, as OCP's `SelectorInput`. */
export interface LabelEntry {
  key: string;
  value: string;
}

/** Splits `key=value` at the first `=` (surrounding whitespace trimmed). */
export function parseLabel(text: string): LabelEntry {
  const eq = text.indexOf('=');
  return eq === -1
    ? { key: text.trim(), value: '' }
    : { key: text.slice(0, eq).trim(), value: text.slice(eq + 1).trim() };
}

/** Renders a label as the input shows it: `key=value`, or `key` when the value is empty. */
export function formatLabel(key: string, value: string): string {
  return value === '' ? key : `${key}=${value}`;
}

/** Why the `key=value` text is not a valid label, or `undefined` when it is. */
export function labelError(text: string): string | undefined {
  const { key, value } = parseLabel(text);
  return metadataKeyError(key) ?? labelValueError(value);
}

/**
 * Validates every entry of the labels input: per-entry rule errors and duplicate keys (the later entry is flagged),
 * keyed by entry index. Empty when all entries are valid.
 */
export function labelEntryErrors(entries: readonly string[]): Map<number, string> {
  const errors = new Map<number, string>();
  const seen = new Set<string>();
  entries.forEach((text, index) => {
    const { key } = parseLabel(text);
    const error = labelError(text) ?? (seen.has(key) ? `Duplicate key "${key}".` : undefined);
    if (error !== undefined) errors.set(index, error);
    seen.add(key);
  });
  return errors;
}

/** One row of the annotations editor. */
export interface AnnotationRow {
  key: string;
  value: string;
}

/**
 * zod schema of the annotations editor (ADR-0015): rows with a blank key are ignored on save (OCP `TagsModal`), the
 * others need a valid key, unique across rows (the later duplicate gets the error).
 */
export const annotationsSchema = z.object({
  rows: z.array(z.object({ key: z.string(), value: z.string() })).superRefine((rows, ctx) => {
    const seen = new Set<string>();
    rows.forEach(({ key: raw }, index) => {
      const key = raw.trim();
      if (key === '') return;
      const error = metadataKeyError(key) ?? (seen.has(key) ? `Duplicate key "${key}".` : undefined);
      if (error !== undefined) ctx.addIssue({ code: 'custom', message: error, path: [index, 'key'] });
      seen.add(key);
    });
  }),
});

/** Form values of the annotations editor. */
export type AnnotationsFormValues = z.infer<typeof annotationsSchema>;

/** The annotations object a save sends: non-blank keys (trimmed) with their values, in row order. */
export function rowsToAnnotations(rows: readonly AnnotationRow[]): Record<string, string> {
  return Object.fromEntries(
    rows.filter((row) => row.key.trim() !== '').map((row) => [row.key.trim(), row.value]),
  );
}
