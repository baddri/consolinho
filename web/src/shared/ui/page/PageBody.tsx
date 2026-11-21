import { PageSection } from '@patternfly/react-core';
import type { ReactNode } from 'react';

/** Props for {@link PageBody}. */
export interface PageBodyProps {
  children: ReactNode;
  /** Stretch to the bottom of the (filled) main area — YAML editor, empty states. */
  isFilled?: boolean;
  /** Lets a page label the region, e.g. as the panel of the active tab. */
  id?: string;
  'aria-labelledby'?: string;
}

/** Padded content section under the heading/tabs (OCP `PaneBody`, `UX.md` §4). */
export function PageBody({ children, isFilled, id, 'aria-labelledby': labelledBy }: PageBodyProps) {
  return (
    <PageSection isFilled={isFilled} id={id} aria-labelledby={labelledBy}>
      {children}
    </PageSection>
  );
}
