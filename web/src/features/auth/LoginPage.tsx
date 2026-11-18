import { Content, PageSection, Title } from '@patternfly/react-core';

/** Login page (`/login`), rendered outside the app shell. Placeholder until authentication lands. */
export function LoginPage() {
  return (
    <PageSection>
      <Title headingLevel="h1">Log in to FleetConsole</Title>
      <Content component="p">This page is a placeholder.</Content>
    </PageSection>
  );
}
