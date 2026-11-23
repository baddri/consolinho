import { PageSection } from '@patternfly/react-core';
import type { ReactNode } from 'react';
import { useId } from 'react';
import styles from './DetailsSubsection.module.css';
import { SectionHeading } from './SectionHeading';

/** Props for {@link DetailsSubsection}. */
export interface DetailsSubsectionProps {
  /** Section heading (h2), e.g. "Pod details", "Containers". */
  title: string;
  /** Controls at the right end of the heading ({@link SectionHeading} `actions`). */
  actions?: ReactNode;
  children: ReactNode;
}

/**
 * One section of a details tab (OCP `PaneBody` + `SectionHeading`, `UX.md` §6): a padded page section labelled by its
 * h2, separated from the section before it by a top border (OCP `.co-m-pane__body + .co-m-pane__body`). Render the
 * sections as siblings directly in the tab panel, not inside a `PageBody`.
 */
export function DetailsSubsection({ title, actions, children }: DetailsSubsectionProps) {
  const headingId = useId();
  return (
    <PageSection hasBodyWrapper={false} aria-labelledby={headingId} className={styles.section}>
      <SectionHeading text={title} id={headingId} actions={actions} />
      {children}
    </PageSection>
  );
}
