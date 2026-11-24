import { Button, Grid, GridItem, TextInput, Tooltip } from '@patternfly/react-core';
import { RhUiMinusCircleIcon } from '@patternfly/react-icons';
import { useController, useWatch, type Control, type UseFormSetValue } from 'react-hook-form';
import { fieldA11y, FieldHelperText } from '@/shared/forms';
import { KindBadge } from '@/shared/ui';
import type { DeploymentFormValues, EnvRow } from './deploymentFormSchema';
import styles from './EditDeployment.module.css';
import { FilterSelect, type FilterSelectGroup } from './FilterSelect';
import type { EnvSource, EnvSources } from './useEnvSources';

type RowPath = `containers.${number}.env.${number}`;

/** Props shared by a row and its parts. */
interface RowPartProps {
  control: Control<DeploymentFormValues>;
  /** The row's form path, `containers.<i>.env.<j>`. */
  path: RowPath;
  isDisabled: boolean;
}

/** One text input of a row (OCP `pairs-list` name/value input): placeholder and label are the column title. */
function PairInput({ control, path, isDisabled, part }: RowPartProps & { part: 'name' | 'value' }) {
  const label = part === 'name' ? 'Name' : 'Value';
  const {
    field: { ref, value, onChange, onBlur, name },
    fieldState,
  } = useController({ control, name: `${path}.${part}` });
  const a11y = fieldA11y(name, fieldState.error, undefined);
  return (
    <>
      <TextInput
        ref={ref}
        id={a11y.fieldId}
        name={name}
        type="text"
        placeholder={label}
        aria-label={label}
        value={typeof value === 'string' ? value : ''}
        onChange={(_event, text) => onChange(text)}
        onBlur={onBlur}
        isDisabled={isDisabled}
        validated={a11y.isInvalid ? 'error' : 'default'}
        aria-invalid={a11y.isInvalid}
        aria-describedby={a11y.describedBy}
      />
      <FieldHelperText id={a11y.helperId} error={fieldState.error} />
    </>
  );
}

/** A resource's name with its kind badge (OCP `ResourceName`). */
const resourceLabel = (kind: EnvSource['kind'], name: string) => (
  <>
    <KindBadge kind={kind} /> {name}
  </>
);

const toGroup = (label: string, sources: EnvSource[]): FilterSelectGroup => ({
  label,
  options: sources.map((source) => ({
    value: `${source.kind}:${source.name}`,
    label: resourceLabel(source.kind, source.name),
    text: source.name,
  })),
});

/**
 * The value of a ConfigMap/Secret key row (OCP `ConfigMapSecretKeyRef`): a filterable resource select with the
 * namespace's ConfigMaps and Secrets under their headers, then a key select listing that resource's key names.
 * Picking another resource clears the key without validating it, so "Select a key" shows only once the key select
 * is used or on Save (OCP `ConfigMapSecretKeyRef`).
 */
function KeyRefValue({
  control,
  path,
  isDisabled,
  sources,
  setValue,
}: RowPartProps & { sources: EnvSources; setValue: UseFormSetValue<DeploymentFormValues> }) {
  const kind = useController({ control, name: `${path}.refKind` });
  const resource = useController({ control, name: `${path}.refName` });
  const key = useController({ control, name: `${path}.key` });
  const refKind = typeof kind.field.value === 'string' ? kind.field.value : '';
  const refName = typeof resource.field.value === 'string' ? resource.field.value : '';
  const keyName = typeof key.field.value === 'string' ? key.field.value : '';
  const source = [...sources.configMaps, ...sources.secrets].find(
    (s) => s.kind === refKind && s.name === refName,
  );
  // A key the list doesn't show (resource gone or not listable) stays selectable.
  const keys = source?.keys ?? [];
  const keyOptions = (keyName === '' || keys.includes(keyName) ? keys : [keyName, ...keys]).map((k) => ({
    value: k,
    label: k,
    text: k,
  }));
  const resourceA11y = fieldA11y(resource.field.name, resource.fieldState.error, undefined);
  const keyA11y = fieldA11y(key.field.name, key.fieldState.error, undefined);
  return (
    <div className={styles.valueFrom}>
      <FilterSelect
        toggleContent={
          refName === '' || (refKind !== 'ConfigMap' && refKind !== 'Secret')
            ? 'Select a resource'
            : resourceLabel(refKind, refName)
        }
        selected={`${refKind}:${refName}`}
        groups={[toGroup('ConfigMaps', sources.configMaps), toGroup('Secrets', sources.secrets)]}
        searchPlaceholder="ConfigMap or Secret"
        isDisabled={isDisabled}
        isInvalid={resourceA11y.isInvalid}
        describedBy={resourceA11y.describedBy}
        onSelect={(value) => {
          const [nextKind = '', ...rest] = value.split(':');
          const nextName = rest.join(':');
          if (nextKind === refKind && nextName === refName) return;
          kind.field.onChange(nextKind);
          resource.field.onChange(nextName);
          if (keyName !== '') setValue(`${path}.key`, '', { shouldDirty: true, shouldValidate: false });
        }}
      />
      <FieldHelperText id={resourceA11y.helperId} error={resource.fieldState.error} />
      <div className={styles.valueFromKey}>
        <FilterSelect
          toggleContent={keyName === '' ? 'Select a key' : keyName}
          selected={keyName}
          groups={[{ options: keyOptions }]}
          searchPlaceholder="Key"
          isDisabled={isDisabled || refName === ''}
          isInvalid={keyA11y.isInvalid}
          describedBy={keyA11y.describedBy}
          onSelect={key.field.onChange}
        />
        <FieldHelperText id={keyA11y.helperId} error={key.fieldState.error} />
      </div>
    </div>
  );
}

/** The two read-only inputs OCP shows for a `fieldRef` / `resourceFieldRef` value (`FieldRef`, `ResourceFieldRef`). */
function FixedValue({ row }: { row: Extract<EnvRow, { type: 'fixed' }> }) {
  const { fieldRef, resourceFieldRef } = row.source.valueFrom ?? {};
  const [first, second] = fieldRef
    ? ['FieldRef', fieldRef.fieldPath]
    : resourceFieldRef
      ? [`${resourceFieldRef.containerName ?? ''} - Resource Field`, resourceFieldRef.resource]
      : [Object.keys(row.source.valueFrom ?? {}).join(', '), ''];
  return (
    <div className={styles.valueFrom}>
      {[first, second].map((text, position) => (
        <div key={position} className={styles.readOnlyValue}>
          <TextInput
            type="text"
            value={text}
            aria-label={position === 0 ? 'Value source' : 'Value'}
            isDisabled
          />
        </div>
      ))}
    </div>
  );
}

/** Props for {@link EnvPairRow}. */
export interface EnvPairRowProps extends RowPartProps {
  sources: EnvSources;
  /** Clears a ref's key without validating it. */
  setValue: UseFormSetValue<DeploymentFormValues>;
  onRemove: () => void;
  /** OCP disables Remove on the editor's only, empty row. */
  isRemoveDisabled: boolean;
}

/**
 * One environment variable (OCP `NameValueEditor` `PairElement` + `ValueFromPair`): the name, then a literal value,
 * a ConfigMap/Secret key, or a read-only field/resource ref, then Remove.
 */
export function EnvPairRow({
  control,
  path,
  isDisabled,
  sources,
  setValue,
  onRemove,
  isRemoveDisabled,
}: EnvPairRowProps) {
  const row = useWatch({ control, name: path });
  const parts = { control, path, isDisabled };
  return (
    <Grid hasGutter>
      <GridItem span={5}>
        <PairInput {...parts} part="name" />
      </GridItem>
      <GridItem span={isDisabled ? 7 : 6}>
        {row.type === 'value' && <PairInput {...parts} part="value" />}
        {row.type === 'ref' && <KeyRefValue {...parts} sources={sources} setValue={setValue} />}
        {row.type === 'fixed' && <FixedValue row={row} />}
      </GridItem>
      {!isDisabled && (
        <GridItem span={1}>
          <Tooltip content="Remove">
            <Button
              variant="plain"
              aria-label="Delete"
              icon={<RhUiMinusCircleIcon />}
              onClick={onRemove}
              isDisabled={isRemoveDisabled}
            />
          </Tooltip>
        </GridItem>
      )}
    </Grid>
  );
}
