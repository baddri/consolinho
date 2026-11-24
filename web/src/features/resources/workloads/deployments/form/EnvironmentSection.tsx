import { ActionList, ActionListGroup, ActionListItem, Button, Grid, GridItem } from '@patternfly/react-core';
import { RhUiAddCircleFillIcon } from '@patternfly/react-icons';
import { useFieldArray, useFormState, useWatch, type Control, type UseFormSetValue } from 'react-hook-form';
import { ContainerField, type ContainerChoice } from './ContainerField';
import { DeploymentFormSection, type DeploymentSectionProps } from './DeploymentFormSection';
import type { DeploymentFormValues } from './deploymentFormSchema';
import { blankRefRow, blankValueRow } from './deploymentFormValues';
import { EnvPairRow } from './EnvPairRow';
import { useEnvSources, type EnvSources } from './useEnvSources';

/** Props for {@link EnvEditor}. */
interface EnvEditorProps {
  control: Control<DeploymentFormValues>;
  containerIndex: number;
  sources: EnvSources;
  setValue: UseFormSetValue<DeploymentFormValues>;
}

/**
 * OCP `NameValueEditor` as `EnvironmentField` configures it (no sorting): "Name"/"Value" column titles, one row per
 * variable, "Add value" and "Add from ConfigMap or Secret". There is always at least one row: removing the last one
 * leaves an empty row, whose Remove is disabled. Read-only users get no actions.
 */
function EnvEditor({ control, containerIndex, sources, setValue }: EnvEditorProps) {
  const name = `containers.${containerIndex}.env` as const;
  const { fields, append, remove, replace } = useFieldArray({ control, name });
  const rows = useWatch({ control, name });
  const { disabled } = useFormState({ control });
  const only = rows[0];
  const isEmpty = rows.length === 1 && only?.type === 'value' && only.name === '' && only.value === '';
  const removeRow = (index: number) => {
    if (fields.length === 1) replace([blankValueRow()]);
    else remove(index);
  };
  return (
    <Grid hasGutter>
      <GridItem span={5}>Name</GridItem>
      <GridItem span={disabled ? 7 : 6}>Value</GridItem>
      {!disabled && <GridItem span={1} />}
      {fields.map((field, index) => (
        <GridItem span={12} key={field.id}>
          <EnvPairRow
            control={control}
            path={`${name}.${index}`}
            isDisabled={disabled}
            sources={sources}
            setValue={setValue}
            onRemove={() => removeRow(index)}
            isRemoveDisabled={isEmpty}
          />
        </GridItem>
      ))}
      {!disabled && (
        <GridItem>
          <ActionList>
            <ActionListGroup>
              <ActionListItem>
                <Button
                  variant="link"
                  icon={<RhUiAddCircleFillIcon />}
                  onClick={() => append(blankValueRow())}
                >
                  Add value
                </Button>
              </ActionListItem>
              <ActionListItem>
                <Button variant="link" icon={<RhUiAddCircleFillIcon />} onClick={() => append(blankRefRow())}>
                  Add from ConfigMap or Secret
                </Button>
              </ActionListItem>
            </ActionListGroup>
          </ActionList>
        </GridItem>
      )}
    </Grid>
  );
}

/** Props for {@link EnvironmentSection}. */
export interface EnvironmentSectionProps extends DeploymentSectionProps {
  cluster: string;
  namespace: string | undefined;
  container: ContainerChoice;
  /** Sets a value without validating it (clearing a ref's key). */
  setValue: UseFormSetValue<DeploymentFormValues>;
}

/**
 * "Environment Variables" (OCP `EnvironmentVariablesSection`): the container being edited, then its `env` entries.
 * Values can be literal or a key of one of the namespace's ConfigMaps or Secrets (only key names are listed);
 * `fieldRef`/`resourceFieldRef` entries show read-only and are kept, and `envFrom` is never touched.
 */
export function EnvironmentSection({
  control,
  cluster,
  namespace,
  container,
  setValue,
}: EnvironmentSectionProps) {
  const sources = useEnvSources(cluster, namespace);
  if (container.names.length === 0) return null;
  return (
    <DeploymentFormSection title="Environment Variables">
      <ContainerField id="environment-container" {...container} />
      <EnvEditor
        key={container.index}
        control={control}
        containerIndex={container.index}
        sources={sources}
        setValue={setValue}
      />
    </DeploymentFormSection>
  );
}
