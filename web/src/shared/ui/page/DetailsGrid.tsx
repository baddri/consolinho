import {
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  Grid,
  GridItem,
} from '@patternfly/react-core';
import type { ReactNode } from 'react';

/**
 * Two-column details layout (OCP `ResourceSummary` + `DetailsItem`, `UX.md` §6): put two {@link DetailsColumn}s
 * inside; they sit side by side from `sm` (576 px) and stack below.
 */
export function DetailsGrid({ children }: { children: ReactNode }) {
  return <Grid hasGutter>{children}</Grid>;
}

/** One half of a {@link DetailsGrid}: a vertical `DescriptionList` (term above value, never horizontal). */
export function DetailsColumn({ children }: { children: ReactNode }) {
  return (
    <GridItem sm={6}>
      <DescriptionList>{children}</DescriptionList>
    </GridItem>
  );
}

/** Props for {@link DetailsItem}. */
export interface DetailsItemProps {
  label: string;
  children: ReactNode;
  'data-testid'?: string;
}

/** One term/value pair of a {@link DetailsColumn}. */
export function DetailsItem({ label, children, 'data-testid': testId }: DetailsItemProps) {
  return (
    <DescriptionListGroup data-testid={testId}>
      <DescriptionListTerm>{label}</DescriptionListTerm>
      <DescriptionListDescription>{children}</DescriptionListDescription>
    </DescriptionListGroup>
  );
}
