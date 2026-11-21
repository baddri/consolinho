import { PageSection } from '@patternfly/react-core';
import type { ReactNode } from 'react';

/** Props for {@link PageBody}. */
export interface PageBodyProps {
  children: ReactNode;
  /**
   * Stretch to the bottom of the (filled) main area — YAML editor, empty states. Drops PF's body wrapper, which
   * doesn't stretch, so a filled child (`Stack` with an `isFilled` item) can reach the bottom too.
   */
  isFilled?: boolean;
  /** e.g. `tabpanel` for the content of the active `PageTabs` tab. */
  role?: string;
  'aria-label'?: string;
  /** Lets a page label the region, e.g. as the panel of the active tab. */
  id?: string;
  'aria-labelledby'?: string;
}

/** Padded content section under the heading/tabs (OCP `PaneBody`, `UX.md` §4). */
export function PageBody({
  children,
  isFilled,
  id,
  role,
  'aria-label': ariaLabel,
  'aria-labelledby': labelledBy,
}: PageBodyProps) {
  return (
    <PageSection
      isFilled={isFilled}
      hasBodyWrapper={!isFilled}
      id={id}
      role={role}
      aria-label={ariaLabel}
      aria-labelledby={labelledBy}
    >
      {children}
    </PageSection>
  );
}
