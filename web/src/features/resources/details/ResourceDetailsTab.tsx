import { Stack, StackItem, Title } from '@patternfly/react-core';
import { useResourceDetails } from './detailsContext';
import { MetadataSection } from './MetadataSection';

/**
 * Details tab (UI-4): "<Kind> details" with the common {@link MetadataSection}, then the descriptor's kind-specific
 * `DetailsSection` if it has one. Re-renders on every watch update of the object. Lazy route module.
 */
export function ResourceDetailsTab() {
  const { cluster, descriptor, obj } = useResourceDetails();
  return (
    <Stack hasGutter>
      <StackItem>
        <Title headingLevel="h2">{descriptor.model.label} details</Title>
      </StackItem>
      <StackItem>
        <MetadataSection cluster={cluster} obj={obj} />
      </StackItem>
      {/* Rendered as a component (not called) so a section may use hooks. */}
      {descriptor.DetailsSection && (
        <StackItem>
          <descriptor.DetailsSection obj={obj} />
        </StackItem>
      )}
    </Stack>
  );
}
