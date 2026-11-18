import {
  Content,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  PageSection,
  Title,
} from '@patternfly/react-core';

/** Props for {@link PlaceholderPage}. */
export interface PlaceholderPageProps {
  title: string;
  /** Route parameters (or other context) to display, in insertion order. Undefined values are skipped. */
  details?: Record<string, string | undefined>;
}

/**
 * Stand-in page used while a feature is not implemented yet. Shows the page title and the route parameters it
 * received so routing can be verified by eye and in tests.
 */
export function PlaceholderPage({ title, details = {} }: PlaceholderPageProps) {
  const entries = Object.entries(details).filter(
    (entry): entry is [string, string] => entry[1] !== undefined,
  );
  return (
    <PageSection>
      <Title headingLevel="h1">{title}</Title>
      <Content component="p">This page is a placeholder.</Content>
      {entries.length > 0 && (
        <DescriptionList isHorizontal aria-label="Route parameters">
          {entries.map(([term, value]) => (
            <DescriptionListGroup key={term}>
              <DescriptionListTerm>{term}</DescriptionListTerm>
              <DescriptionListDescription>{value}</DescriptionListDescription>
            </DescriptionListGroup>
          ))}
        </DescriptionList>
      )}
    </PageSection>
  );
}
