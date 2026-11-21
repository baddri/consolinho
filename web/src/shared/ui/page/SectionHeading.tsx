import { Title } from '@patternfly/react-core';

/** Props for {@link SectionHeading}. */
export interface SectionHeadingProps {
  text: string;
  /** Anchor id, e.g. for `aria-labelledby` of the section below. */
  id?: string;
}

/** Section title inside a page body, e.g. "Pod details" (OCP `utils/headings.tsx:SectionHeading`, `UX.md` §6). */
export function SectionHeading({ text, id }: SectionHeadingProps) {
  return (
    <Title headingLevel="h2" size="lg" id={id} className="pf-v6-u-mb-md">
      {text}
    </Title>
  );
}
