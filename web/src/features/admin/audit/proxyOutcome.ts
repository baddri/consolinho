import { z } from 'zod';
import type { AuditEntry } from '@/shared/api';

/** Why the proxy refused a mutation (`details.reason` of a denied proxy audit entry, CP2 contract §5). */
const REASON_TEXT = {
  noAccess: 'no access',
  userReadOnly: 'read-only user',
  readOnlyGrant: 'read-only grant',
  bodyTooLarge: 'body too large',
} as const;

/**
 * `details` of a proxy audit entry. The server types `details` as free-form JSON, so it is parsed defensively here;
 * extra fields are ignored and an unknown reason still shows as plain "Denied".
 */
const proxyDetailsSchema = z.discriminatedUnion('outcome', [
  z.object({ outcome: z.literal('allowed'), statusCode: z.number().int() }),
  z.object({ outcome: z.literal('denied'), reason: z.string().nullish() }),
]);

/** Display of a proxy entry's outcome: the label text and its PatternFly `Label` colour. */
export interface ProxyOutcome {
  label: string;
  color: 'red' | 'green' | 'grey';
}

const isReason = (reason: string): reason is keyof typeof REASON_TEXT => Object.hasOwn(REASON_TEXT, reason);

/**
 * Outcome label of a proxied Kubernetes mutation (PAUD-4): allowed → the upstream status code (green for 2xx, grey
 * for 0 = client disconnected, red otherwise); denied → "Denied — <reason>" in red. `undefined` when `details` doesn't
 * parse (other categories, or a shape this client doesn't know).
 */
export function proxyOutcome(entry: Pick<AuditEntry, 'details'>): ProxyOutcome | undefined {
  const parsed = proxyDetailsSchema.safeParse(entry.details);
  if (!parsed.success) return undefined;
  const details = parsed.data;
  if (details.outcome === 'denied') {
    const reason = details.reason && isReason(details.reason) ? REASON_TEXT[details.reason] : undefined;
    return { label: reason ? `Denied — ${reason}` : 'Denied', color: 'red' };
  }
  const { statusCode } = details;
  if (statusCode === 0) return { label: '0 — client disconnected', color: 'grey' };
  return { label: String(statusCode), color: statusCode >= 200 && statusCode < 300 ? 'green' : 'red' };
}
