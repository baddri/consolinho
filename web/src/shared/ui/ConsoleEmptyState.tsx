import { EmptyState, EmptyStateBody, type EmptyStateProps } from '@patternfly/react-core';
import type { ReactNode } from 'react';

/** Props for {@link ConsoleEmptyState}. */
export interface ConsoleEmptyStateProps {
  /** Optional heading; pass a `headingLevel` that fits the page outline with it. */
  title?: string;
  /** Heading level of `title` (OCP passes none, so PF's default applies there). */
  headingLevel?: EmptyStateProps['headingLevel'];
  /** Body text, rendered in `EmptyStateBody` (16px, subtle colour). */
  children?: ReactNode;
  /** Default `sm`, as OCP. */
  variant?: EmptyStateProps['variant'];
}

/**
 * OCP's inline "nothing here" block (`console-shared` `ConsoleEmptyState`): a small, centred PF `EmptyState` with
 * extra top padding from md up, used for "No conditions found", "No events" and similar section-level empties. List
 * tables use `ConsoleDataView`'s own empty row instead.
 */
export function ConsoleEmptyState({ title, headingLevel, children, variant = 'sm' }: ConsoleEmptyStateProps) {
  return (
    <EmptyState
      variant={variant}
      className="pf-v6-u-pt-xl-on-md"
      titleText={title}
      headingLevel={headingLevel}
    >
      {children !== undefined && <EmptyStateBody>{children}</EmptyStateBody>}
    </EmptyState>
  );
}
