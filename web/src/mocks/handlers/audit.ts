import type { AuditCategory, AuditEntry } from '@/shared/api';
import { mockDb } from '../db';
import { validationProblem, type FieldErrors } from '../problem';
import { http } from './http';

const CATEGORIES: readonly AuditCategory[] = ['auth', 'users', 'clusters', 'credentials', 'grants', 'proxy'];
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/** Opaque keyset cursor: base64 of the last returned entry's id (stable while new entries arrive). */
export function encodeAuditCursor(id: string): string {
  return btoa(id);
}

/** Position in the newest-first log after which the next page starts; `undefined` for an invalid cursor. */
function cursorPosition(cursor: string): number | undefined {
  let id: string;
  try {
    id = atob(cursor);
  } catch {
    return undefined;
  }
  const index = mockDb.audit.findIndex((entry) => entry.id === id);
  return index === -1 ? undefined : index;
}

/** Adds `message` to `errors[key]` (query parameters are validated here, not bound from a JSON body). */
function addError(errors: FieldErrors, key: string, message: string): void {
  (errors[key] ??= []).push(message);
}

/** Parses an ISO timestamp query value; records an error under `key` when it doesn't parse. */
function timestamp(value: string | null, key: string, errors: FieldErrors): number | undefined {
  if (value === null || value === '') return undefined;
  const time = Date.parse(value);
  if (Number.isNaN(time)) addError(errors, key, 'Enter an ISO 8601 timestamp.');
  return time;
}

/** `user` filter: the user is the actor, the target user, or the user of a target grant (USR-7). */
function involvesUser(entry: AuditEntry, user: string): boolean {
  return (
    entry.actor === user ||
    (entry.targetType === 'user' && entry.targetName === user) ||
    (entry.targetType === 'grant' && entry.targetName.startsWith(`${user} → `))
  );
}

/** `GET /api/admin/audit` (contract §10): all filters combined with AND, newest first, keyset-paginated. */
export const auditHandlers = [
  http.get('/api/admin/audit', ({ query, response }) => {
    const errors: FieldErrors = {};

    const rawCategory: string | null = query.get('category');
    const category = CATEGORIES.find((candidate) => candidate === rawCategory);
    if (rawCategory !== null && category === undefined) addError(errors, 'category', 'Unknown category.');

    const from = timestamp(query.get('from'), 'from', errors);
    const to = timestamp(query.get('to'), 'to', errors);

    const rawLimit = query.get('limit');
    const limit = rawLimit === null ? DEFAULT_LIMIT : Number(rawLimit);
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
      addError(errors, 'limit', `Limit must be between 1 and ${MAX_LIMIT}.`);
    }

    const cursor = query.get('cursor');
    const start = cursor === null ? 0 : cursorPosition(cursor);
    if (start === undefined) addError(errors, 'cursor', 'The cursor is invalid. Reload the audit log.');
    if (Object.keys(errors).length > 0 || start === undefined) return validationProblem(errors);

    const actor = query.get('actor');
    const user = query.get('user');
    const cluster = query.get('cluster');
    const target = query.get('target')?.toLowerCase() ?? null;
    const matches = (entry: AuditEntry): boolean => {
      const time = Date.parse(entry.occurredAt);
      return (
        (actor === null || entry.actor === actor) &&
        (user === null || involvesUser(entry, user)) &&
        (category === undefined || entry.category === category) &&
        (cluster === null || entry.clusterName === cluster) &&
        (target === null || entry.targetName.toLowerCase().includes(target)) &&
        (from === undefined || time >= from) &&
        (to === undefined || time < to)
      );
    };

    // Entries after the cursor entry; one extra item tells whether another page exists.
    const offset = cursor === null ? 0 : start + 1;
    const page: AuditEntry[] = [];
    for (let i = offset; i < mockDb.audit.length && page.length <= limit; i++) {
      const entry = mockDb.audit[i];
      if (entry && matches(entry)) page.push(entry);
    }
    const hasMore = page.length > limit;
    const items = page.slice(0, limit);
    const last = items.at(-1);
    return response(200).json({ items, nextCursor: hasMore && last ? encodeAuditCursor(last.id) : null });
  }),
];
