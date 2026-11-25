import { Alert } from '@patternfly/react-core';
import { errorMessage } from '@/shared/api';
import { probeOutcome } from '@/shared/health';

/** OCP's subtle "Not available" for a value the user may not read (403) or the cluster doesn't have (404). */
export function NotAvailable() {
  return <span className="pf-v6-u-text-color-subtle">Not available</span>;
}

/** Whether `error` is an expected "can't read this" (403/404) that renders as {@link NotAvailable}. */
export function isUnreadable(error: unknown): boolean {
  return probeOutcome(error) !== undefined;
}

/** Props for {@link CardReadErrors}. */
export interface CardReadErrorsProps {
  /** Each read of the card by its name (`ClusterVersion`, `Nodes`) with its error, if any. */
  reads: readonly (readonly [read: string, error: unknown])[];
}

/**
 * The inline errors of a dashboard card (OVW-6): one plain inline danger `Alert` per failed read, naming it
 * ("ClusterVersion: …"). 403/404 are left to the rows ({@link NotAvailable}), so only unexpected failures (5xx,
 * network) show here; the card's other content stays, and nothing is thrown to the page.
 */
export function CardReadErrors({ reads }: CardReadErrorsProps) {
  const failed = reads.filter(([, error]) => error && !isUnreadable(error));
  if (failed.length === 0) return null;
  return (
    <>
      {failed.map(([read, error]) => (
        <Alert key={read} variant="danger" isInline isPlain title={`${read}: ${errorMessage(error)}`} />
      ))}
    </>
  );
}
