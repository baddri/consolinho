import { useMemo } from 'react';
import { resolveSchemaPath, useOpenApiSchema, type K8sModel } from '@/shared/k8s';
import {
  DetailsColumn,
  DetailsGrid,
  DetailsSubsection,
  FieldHelpContext,
  SectionHeading,
  type FieldHelp,
} from '@/shared/ui';
import { useResourceDetails } from './detailsContext';
import { MetadataSection } from './MetadataSection';

/**
 * Field help for `model`'s details terms (HELP-1, OCP `getPropertyDescription`): resolves a dotted path against the
 * cluster's OpenAPI schema. `null` while the schema loads or when it is unavailable (403, absent kind), so terms stay
 * plain and nothing errors.
 */
function useFieldHelp(cluster: string, model: K8sModel): FieldHelp | null {
  const schema = useOpenApiSchema(cluster, model);
  return useMemo(
    () =>
      schema
        ? {
            kindLabel: model.kind,
            describe: (path: string) =>
              resolveSchemaPath(schema.doc, schema.rootName, path.split('.'))?.description,
          }
        : null,
    [schema, model.kind],
  );
}

/**
 * Details tab (UI-4, OCP `DeploymentDetails`/`PodDetails`, `UX.md` §6): a "<Kind> details" section with the
 * descriptor's `DetailsTop` (pod ring) over two columns — the common {@link MetadataSection} left, the descriptor's
 * `DetailsSection` fields right (under its optional `detailsTitle`, OCP "Job status"), or the descriptor's own
 * `DetailsOverview` in their place (OCP `NodeDetailsOverview`) — then the descriptor's `ExtraSections` (Containers, Volumes, Conditions, …), each its
 * own bordered `DetailsSubsection`. Provides the cluster schema's field help ({@link useFieldHelp}) to every
 * `DetailsItem` below. Re-renders on every watch update. Lazy route module.
 */
export function ResourceDetailsTab() {
  const { cluster, descriptor, obj } = useResourceDetails();
  const { label } = descriptor.model;
  const fieldHelp = useFieldHelp(cluster, descriptor.model);
  return (
    <FieldHelpContext value={fieldHelp}>
      <DetailsSubsection title={`${label} details`}>
        {/* Rendered as components (not called) so a section may use hooks. */}
        {descriptor.DetailsTop && <descriptor.DetailsTop obj={obj} />}
        {descriptor.DetailsOverview ? (
          <descriptor.DetailsOverview obj={obj} />
        ) : (
          <DetailsGrid>
            <DetailsColumn aria-label="Metadata">
              <MetadataSection cluster={cluster} descriptor={descriptor} obj={obj} />
            </DetailsColumn>
            {descriptor.DetailsSection && (
              <DetailsColumn aria-label={`${label} properties`}>
                {descriptor.detailsTitle && <SectionHeading text={descriptor.detailsTitle} />}
                <descriptor.DetailsSection obj={obj} />
              </DetailsColumn>
            )}
          </DetailsGrid>
        )}
      </DetailsSubsection>
      {descriptor.ExtraSections && <descriptor.ExtraSections obj={obj} />}
    </FieldHelpContext>
  );
}
