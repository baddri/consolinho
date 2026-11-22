import { DetailsColumn, DetailsGrid, DetailsSubsection } from '@/shared/ui';
import { useResourceDetails } from './detailsContext';
import { MetadataSection } from './MetadataSection';

/**
 * Details tab (UI-4, OCP `DeploymentDetails`/`PodDetails`, `UX.md` §6): a "<Kind> details" section with the
 * descriptor's `DetailsTop` (pod ring) over two columns — the common {@link MetadataSection} left, the descriptor's
 * `DetailsSection` fields right — then the descriptor's `ExtraSections` (Containers, Volumes, Conditions, …), each its
 * own bordered `DetailsSubsection`. Re-renders on every watch update. Lazy route module.
 */
export function ResourceDetailsTab() {
  const { cluster, descriptor, obj } = useResourceDetails();
  const { label } = descriptor.model;
  return (
    <>
      <DetailsSubsection title={`${label} details`}>
        {/* Rendered as components (not called) so a section may use hooks. */}
        {descriptor.DetailsTop && <descriptor.DetailsTop obj={obj} />}
        <DetailsGrid>
          <DetailsColumn aria-label="Metadata">
            <MetadataSection cluster={cluster} descriptor={descriptor} obj={obj} />
          </DetailsColumn>
          {descriptor.DetailsSection && (
            <DetailsColumn aria-label={`${label} properties`}>
              <descriptor.DetailsSection obj={obj} />
            </DetailsColumn>
          )}
        </DetailsGrid>
      </DetailsSubsection>
      {descriptor.ExtraSections && <descriptor.ExtraSections obj={obj} />}
    </>
  );
}
