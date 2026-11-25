import { Button, Flex, FlexItem } from '@patternfly/react-core';
import { Fragment } from 'react';
import type { FleetStatusKey, FleetTableRow } from './fleetTableRows';

/** Props for {@link FleetSummary}. */
export interface FleetSummaryProps {
  /** Every row, unfiltered: the counts describe the fleet, not the current filter. */
  rows: readonly FleetTableRow[];
  /** Sets the Status filter to `statuses` (empty = any status). */
  onStatusFilter: (statuses: FleetStatusKey[]) => void;
}

/** The counted statuses, in the summary's order. */
const COUNTED: readonly { status: FleetStatusKey; text: string }[] = [
  { status: 'degraded', text: 'degraded' },
  { status: 'unreachable', text: 'unreachable' },
  { status: 'updating', text: 'updating' },
];

/**
 * The fleet summary line above the table (FLT-5, a fleet invention): "<n> clusters · <d> degraded · <u> unreachable ·
 * <p> updating", each non-zero count an inline link that sets the Status filter ("<n> clusters" clears it).
 */
export function FleetSummary({ rows, onStatusFilter }: FleetSummaryProps) {
  const count = (status: FleetStatusKey) => rows.filter((row) => row.statusKey === status).length;
  const items = [
    {
      key: 'all',
      text: `${String(rows.length)} ${rows.length === 1 ? 'cluster' : 'clusters'}`,
      onClick: () => onStatusFilter([]),
    },
    ...COUNTED.map(({ status, text }) => {
      const n = count(status);
      // A zero count would only filter to "No clusters found": plain text, not a link.
      return {
        key: status,
        text: `${String(n)} ${text}`,
        onClick: n > 0 ? () => onStatusFilter([status]) : undefined,
      };
    }),
  ];
  return (
    <Flex
      className="pf-v6-u-mb-md"
      gap={{ default: 'gapSm' }}
      alignItems={{ default: 'alignItemsBaseline' }}
      aria-label="Fleet summary"
      role="group"
    >
      {items.map(({ key, text, onClick }, index) => (
        <Fragment key={key}>
          {index > 0 && (
            <FlexItem aria-hidden="true" className="pf-v6-u-text-color-subtle">
              ·
            </FlexItem>
          )}
          {onClick ? (
            <FlexItem>
              <Button variant="link" isInline onClick={onClick}>
                {text}
              </Button>
            </FlexItem>
          ) : (
            <FlexItem className="pf-v6-u-text-color-subtle">{text}</FlexItem>
          )}
        </Fragment>
      ))}
    </Flex>
  );
}
