import { zodResolver } from '@hookform/resolvers/zod';
import {
  ActionList,
  ActionListItem,
  Button,
  FormHelperText,
  Grid,
  GridItem,
  HelperText,
  HelperTextItem,
  TextInput,
  Tooltip,
} from '@patternfly/react-core';
import { RhUiAddCircleFillIcon, RhUiMinusCircleIcon } from '@patternfly/react-icons';
import { Fragment, useId } from 'react';
import { useController, useFieldArray, useForm, type Control } from 'react-hook-form';
import { metadataTarget, useMetadataPatch, type EditMetadataModalProps } from './EditLabelsModal';
import { annotationsSchema, rowsToAnnotations, type AnnotationsFormValues } from './labelValidation';
import { ResourceMutationModal } from './ResourceMutationModal';

/** One Key or Value input of an annotations row, bound to react-hook-form; the key shows its zod error below. */
function AnnotationInput({
  control,
  index,
  part,
}: {
  control: Control<AnnotationsFormValues>;
  index: number;
  part: 'key' | 'value';
}) {
  const label = part === 'key' ? 'Key' : 'Value';
  const {
    field: { ref, value, onChange, onBlur, name },
    fieldState: { error },
  } = useController({ control, name: `rows.${index}.${part}` });
  const helperId = useId();
  return (
    <>
      <TextInput
        ref={ref}
        name={name}
        aria-label={label}
        placeholder={label}
        value={value}
        onChange={(_event, text) => onChange(text)}
        onBlur={onBlur}
        spellCheck={false}
        validated={error ? 'error' : 'default'}
        aria-invalid={error !== undefined}
        aria-describedby={error ? helperId : undefined}
      />
      {error && (
        <FormHelperText>
          <HelperText id={helperId}>
            <HelperTextItem variant="error">{error.message}</HelperTextItem>
          </HelperText>
        </FormHelperText>
      )}
    </>
  );
}

/**
 * OCP's "Edit annotations" modal (`modals/tags.tsx` `TagsModal` + `NameValueEditor`): a Key / Value grid (5 + 6
 * columns and a remove button), "Add more" below. Starts with one blank row when the object has no annotations;
 * rows with a blank key are dropped on save; invalid or duplicate keys are field errors (zod). Save replaces
 * `/metadata/annotations` in one JSON Patch.
 */
export function EditAnnotationsModal({ cluster, model, obj, onClose }: EditMetadataModalProps) {
  const current = obj.metadata.annotations ?? {};
  const pairs = Object.entries(current).map(([key, value]) => ({ key, value }));
  const { control, handleSubmit } = useForm<AnnotationsFormValues>({
    resolver: zodResolver(annotationsSchema),
    defaultValues: { rows: pairs.length > 0 ? pairs : [{ key: '', value: '' }] },
  });
  const { fields, append, remove, replace } = useFieldArray({ control, name: 'rows' });
  const target = metadataTarget(model, obj);
  const mutation = useMetadataPatch(cluster, model, {
    path: '/metadata/annotations',
    exists: obj.metadata.annotations !== undefined,
    what: 'Annotations',
  });

  /** OCP keeps one row: removing the only row leaves a blank one. */
  const removeRow = (index: number) => {
    if (fields.length === 1) replace([{ key: '', value: '' }]);
    else remove(index);
  };

  const save = handleSubmit(({ rows }) => {
    mutation.mutate({ ...target, value: rowsToAnnotations(rows) }, { onSuccess: onClose });
  });

  return (
    <ResourceMutationModal
      title="Edit annotations"
      cluster={cluster}
      namespace={target.namespace}
      objectName={target.name}
      kindLabel={model.kind}
      isSaving={mutation.isPending}
      error={mutation.error}
      onSave={() => void save()}
      onClose={onClose}
      variant="large"
    >
      <Grid hasGutter>
        <GridItem span={5}>Key</GridItem>
        <GridItem span={6}>Value</GridItem>
        <GridItem span={1} />
        {fields.map((field, index) => (
          <Fragment key={field.id}>
            <GridItem span={5}>
              <AnnotationInput control={control} index={index} part="key" />
            </GridItem>
            <GridItem span={6}>
              <AnnotationInput control={control} index={index} part="value" />
            </GridItem>
            <GridItem span={1}>
              <Tooltip content="Remove">
                <Button
                  variant="plain"
                  aria-label="Remove"
                  icon={<RhUiMinusCircleIcon />}
                  onClick={() => removeRow(index)}
                />
              </Tooltip>
            </GridItem>
          </Fragment>
        ))}
        <GridItem span={12}>
          <ActionList>
            <ActionListItem>
              <Button
                variant="link"
                isInline
                icon={<RhUiAddCircleFillIcon />}
                onClick={() => append({ key: '', value: '' })}
              >
                Add more
              </Button>
            </ActionListItem>
          </ActionList>
        </GridItem>
      </Grid>
    </ResourceMutationModal>
  );
}
