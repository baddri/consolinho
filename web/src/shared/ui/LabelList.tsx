import { Label, LabelGroup } from '@patternfly/react-core';

/** Props for {@link LabelList}. */
export interface LabelListProps {
  labels: readonly string[];
  /** Labels shown before collapsing the rest into a "+N" toggle (default 3). */
  max?: number;
  /** Compact labels (default); OCP's resource `LabelList` uses normal-size ones. */
  isCompact?: boolean;
  /** Accessible name of the group, e.g. "Groups". */
  'aria-label'?: string;
}

/**
 * A compact list of plain text labels (e.g. a user's OpenShift groups, USR-1) that collapses after `max` items
 * into a "+N" toggle, keeping table rows one line high. Renders nothing for an empty list.
 */
export function LabelList({ labels, max = 3, isCompact = true, 'aria-label': ariaLabel }: LabelListProps) {
  if (labels.length === 0) {
    return null;
  }
  return (
    // `${remaining}` is PatternFly's placeholder, filled in by LabelGroup — not a JS template literal.
    <LabelGroup numLabels={max} collapsedText="+${remaining}" aria-label={ariaLabel}>
      {labels.map((label) => (
        <Label key={label} isCompact={isCompact}>
          {label}
        </Label>
      ))}
    </LabelGroup>
  );
}
