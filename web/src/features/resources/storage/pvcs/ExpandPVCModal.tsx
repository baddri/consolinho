import { zodResolver } from '@hookform/resolvers/zod';
import {
  Content,
  FormGroup,
  InputGroup,
  InputGroupItem,
  MenuToggle,
  NumberInput,
  Select,
  SelectList,
  SelectOption,
  type MenuToggleElement,
} from '@patternfly/react-core';
import { useState, type Ref } from 'react';
import { useController, useForm } from 'react-hook-form';
import { z } from 'zod';
import { PersistentVolumeClaimModel, type K8sResource, type PersistentVolumeClaim } from '@/shared/k8s';
import { fieldA11y, FieldHelperText } from '@/shared/forms';
import { ResourceMutationModal } from '../../actions/ResourceMutationModal';
import {
  EXPAND_SIZE_UNITS,
  initialExpandSize,
  minExpandValue,
  validateExpandSize,
  type ExpandSize,
  type ExpandSizeUnit,
} from './expandSize';
import styles from './expandPVC.module.css';
import { useExpandPVC } from './useExpandPVC';

/** Id of the size number input, the modal's initial focus; one Expand modal is open at a time. */
const INPUT_ID = 'pvc-expand-size-input';
const UNIT_IDS = Object.keys(EXPAND_SIZE_UNITS) as [ExpandSizeUnit, ...ExpandSizeUnit[]];

/** The schema of one claim: the size must be positive and above `currentRequest` (error on `value`). */
function sizeSchema(currentRequest: string | undefined) {
  return z.object({ value: z.string(), unit: z.enum(UNIT_IDS) }).superRefine((size, ctx) => {
    const message = validateExpandSize(size.value, size.unit, currentRequest);
    if (message !== undefined) ctx.addIssue({ code: 'custom', path: ['value'], message });
  });
}

/** The typed text as `NumberInput`'s value: `''` while empty or not a number. */
function numberValue(text: string): number | '' {
  const number = Number(text);
  return text.trim() === '' || !Number.isFinite(number) ? '' : number;
}

/** Props for {@link UnitSelect}. */
interface UnitSelectProps {
  unit: ExpandSizeUnit;
  onChange: (unit: ExpandSizeUnit) => void;
}

/** OCP `RequestSizeInput`'s unit dropdown (`ConsoleSelect`): MiB / GiB / TiB, labelled "Number of <unit>". */
function UnitSelect({ unit, onChange }: UnitSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const label = EXPAND_SIZE_UNITS[unit];
  return (
    <Select
      isOpen={isOpen}
      selected={unit}
      onOpenChange={setIsOpen}
      onOpenChangeKeys={['Escape', 'Tab']}
      shouldFocusToggleOnSelect
      onSelect={(_event, next) => {
        if (typeof next === 'string' && next in EXPAND_SIZE_UNITS) onChange(next as ExpandSizeUnit);
        setIsOpen(false);
      }}
      toggle={(toggleRef: Ref<MenuToggleElement>) => (
        <MenuToggle
          ref={toggleRef}
          isExpanded={isOpen}
          aria-label={`Number of ${label}`}
          onClick={() => setIsOpen((open) => !open)}
        >
          {label}
        </MenuToggle>
      )}
    >
      <SelectList aria-label="Unit">
        {UNIT_IDS.map((id) => (
          <SelectOption key={id} value={id}>
            {EXPAND_SIZE_UNITS[id]}
          </SelectOption>
        ))}
      </SelectList>
    </Select>
  );
}

/** Props for {@link ExpandPVCModal}. */
export interface ExpandPVCModalProps {
  cluster: string;
  pvc: PersistentVolumeClaim & K8sResource;
  onClose: () => void;
}

/**
 * "Expand PersistentVolumeClaim" (OCP `expand-pvc-modal.tsx`, PVC-3): OCP's description, then "Total size" as OCP's
 * `RequestSizeInput` (a `NumberInput` that can't step below the current size, and a MiB / GiB / TiB select),
 * prefilled from `spec.resources.requests.storage` and focused on open. Save ("Expand") is disabled while the size is
 * not above the current request ({@link validateExpandSize}). Closes on success; a failure stays inline.
 */
export function ExpandPVCModal({ cluster, pvc, onClose }: ExpandPVCModalProps) {
  const currentRequest = pvc.spec?.resources?.requests?.storage;
  const [defaultValues] = useState<ExpandSize>(() => initialExpandSize(currentRequest));
  const [schema] = useState(() => sizeSchema(currentRequest));
  const { control, handleSubmit, formState, trigger } = useForm<ExpandSize>({
    resolver: zodResolver(schema),
    defaultValues,
    mode: 'onChange',
  });
  const {
    field: { ref, value, onChange, onBlur, name: fieldName },
    fieldState,
  } = useController({ control, name: 'value' });
  const { field: unitField } = useController({ control, name: 'unit' });
  const mutation = useExpandPVC(cluster);
  const namespace = pvc.metadata.namespace;
  const name = pvc.metadata.name ?? '';
  const a11y = fieldA11y('value', fieldState.error, undefined);
  const step = (by: number) => {
    const next = (numberValue(value) || 0) + by;
    onChange(String(Math.max(next, 0)));
  };

  const save = handleSubmit((size) => {
    mutation.mutate({ namespace, name, storage: `${size.value.trim()}${size.unit}` }, { onSuccess: onClose });
  });

  return (
    <ResourceMutationModal
      title={`Expand ${PersistentVolumeClaimModel.label}`}
      cluster={cluster}
      namespace={namespace}
      objectName={name}
      kindLabel={PersistentVolumeClaimModel.label}
      saveLabel="Expand"
      isSaving={mutation.isPending}
      error={mutation.error}
      onSave={() => void save()}
      onClose={onClose}
      elementToFocus={`#${INPUT_ID}`}
      isSaveDisabled={Object.keys(formState.errors).length > 0}
      intro={
        // In the body as OCP's `Content` paragraph, not the header description.
        <Content component="p">
          Increase the capacity of PVC <strong>{name}.</strong> Note that capacity must be at least the
          current PVC size. This expansion might take some time to complete.
        </Content>
      }
    >
      <FormGroup label="Total size" isRequired fieldId={INPUT_ID}>
        <InputGroup>
          <InputGroupItem>
            <NumberInput
              value={numberValue(value)}
              min={minExpandValue(currentRequest, unitField.value)}
              inputName={fieldName}
              inputAriaLabel="Total size"
              minusBtnAriaLabel="Decrement"
              plusBtnAriaLabel="Increment"
              validated={a11y.isInvalid ? 'error' : 'default'}
              inputProps={{
                id: INPUT_ID,
                ref,
                onBlur,
                required: true,
                'aria-invalid': a11y.isInvalid,
                'aria-describedby': a11y.describedBy,
              }}
              onMinus={() => step(-1)}
              onPlus={() => step(1)}
              onChange={(event) => onChange(event.currentTarget.value)}
            />
          </InputGroupItem>
          {/* OCP `.request-size-input__unit`: 20px left padding between the spinner and the unit select. */}
          <InputGroupItem className={styles.unit}>
            <UnitSelect
              unit={unitField.value}
              onChange={(unit) => {
                unitField.onChange(unit);
                // The size error depends on the unit too: RHF only re-validates the changed field.
                void trigger('value');
              }}
            />
          </InputGroupItem>
        </InputGroup>
        <FieldHelperText id={a11y.helperId} error={fieldState.error} />
      </FormGroup>
    </ResourceMutationModal>
  );
}
