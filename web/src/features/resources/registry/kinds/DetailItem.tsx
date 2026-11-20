import {
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
} from '@patternfly/react-core';
import type { ReactNode } from 'react';

/** Props for {@link DetailItem}. */
export interface DetailItemProps {
  term: string;
  children: ReactNode;
}

/** One term/value row of a kind's Details `DescriptionList` (shared by the descriptor files in this folder). */
export function DetailItem({ term, children }: DetailItemProps) {
  return (
    <DescriptionListGroup>
      <DescriptionListTerm>{term}</DescriptionListTerm>
      <DescriptionListDescription>{children}</DescriptionListDescription>
    </DescriptionListGroup>
  );
}
