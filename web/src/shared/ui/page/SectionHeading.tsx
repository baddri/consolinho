import { Flex, FlexItem, Title } from '@patternfly/react-core';
import type { ReactNode } from 'react';

/** Props for {@link SectionHeading}. */
export interface SectionHeadingProps {
  text: string;
  /** Anchor id, e.g. for `aria-labelledby` of the section below. */
  id?: string;
  /**
   * Controls at the heading's right end (OCP `SectionHeading` children, e.g. a Secret's "Reveal values"). Rendered
   * beside the h2 rather than inside it so the heading's accessible name stays `text`.
   */
  actions?: ReactNode;
}

/**
 * Section title inside a page body, e.g. "Pod details" (OCP `SecondaryHeading` / `SectionHeading`, `UX.md` §6). No
 * `size`: PF renders `pf-m-h2` (20px/26px/600), as OCP does.
 */
export function SectionHeading({ text, id, actions }: SectionHeadingProps) {
  if (actions === undefined)
    return (
      <Title headingLevel="h2" id={id} className="pf-v6-u-mb-md">
        {text}
      </Title>
    );
  // OCP `.co-section-heading`: flex, space-between, md bottom margin.
  return (
    <Flex
      className="pf-v6-u-mb-md"
      justifyContent={{ default: 'justifyContentSpaceBetween' }}
      alignItems={{ default: 'alignItemsCenter' }}
      flexWrap={{ default: 'nowrap' }}
    >
      <FlexItem>
        <Title headingLevel="h2" id={id}>
          {text}
        </Title>
      </FlexItem>
      <FlexItem>{actions}</FlexItem>
    </Flex>
  );
}
