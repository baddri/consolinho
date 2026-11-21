import { DetailsColumn, DetailsGrid, SectionHeading } from '@/shared/ui';
import { useResourceDetails } from './detailsContext';
import { MetadataSection } from './MetadataSection';

/**
 * Details tab (UI-4, OCP `DeploymentDetails`, `UX.md` §6): "<Kind> details" h2 over two columns — the common
 * {@link MetadataSection} left, the descriptor's `DetailsSection` fields right — then the descriptor's
 * `ExtraSections` (Containers, Conditions, …) full width. Re-renders on every watch update. Lazy route module.
 */
export function ResourceDetailsTab() {
  const { cluster, descriptor, obj } = useResourceDetails();
  const { label } = descriptor.model;
  return (
    <>
      <SectionHeading text={`${label} details`} />
      <DetailsGrid>
        <DetailsColumn aria-label="Metadata">
          <MetadataSection cluster={cluster} obj={obj} />
        </DetailsColumn>
        {/* Rendered as components (not called) so a section may use hooks. */}
        {descriptor.DetailsSection && (
          <DetailsColumn aria-label={`${label} details`}>
            <descriptor.DetailsSection obj={obj} />
          </DetailsColumn>
        )}
      </DetailsGrid>
      {descriptor.ExtraSections && <descriptor.ExtraSections obj={obj} />}
    </>
  );
}
