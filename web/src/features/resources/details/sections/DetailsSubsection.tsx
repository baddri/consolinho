import type { ReactNode } from 'react';
import { useId } from 'react';
import { SectionHeading } from '@/shared/ui';

/** Props for {@link DetailsSubsection}. */
export interface DetailsSubsectionProps {
  /** Section heading (h2), e.g. "Containers". */
  title: string;
  children: ReactNode;
}

/**
 * One further section of the Details tab below the "<Kind> details" grid (OCP: each with its own `SectionHeading`,
 * `UX.md` §6). Spaced from the content above it; the region is labelled by its heading.
 */
export function DetailsSubsection({ title, children }: DetailsSubsectionProps) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="pf-v6-u-mt-xl">
      <SectionHeading text={title} id={headingId} />
      {children}
    </section>
  );
}
