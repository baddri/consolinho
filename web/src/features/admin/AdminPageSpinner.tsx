import { Bullseye, PageSection, Spinner } from '@patternfly/react-core';

/** Placeholder shown in the page area while an admin page's code chunk loads on the first visit (`HydrateFallback`). */
export function AdminPageSpinner() {
  return (
    <PageSection isFilled>
      <Bullseye>
        <Spinner aria-label="Loading page" />
      </Bullseye>
    </PageSection>
  );
}
