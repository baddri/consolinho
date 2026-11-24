import { zodResolver } from '@hookform/resolvers/zod';
import {
  Content,
  FormGroup,
  FormSection,
  InputGroup,
  InputGroupItem,
  InputGroupText,
  Radio,
  TextInput,
  Tooltip,
} from '@patternfly/react-core';
import { useController, useForm, type Control } from 'react-hook-form';
import { z } from 'zod';
import { DeploymentModel, k8sPatch, type Deployment, type K8sResource } from '@/shared/k8s';
import { fieldA11y, FieldHelperText } from '@/shared/forms';
import {
  DEFAULT_BOUND,
  INT_OR_PERCENT_MESSAGE,
  isValidBound,
  toDeploymentStrategy,
  type DeploymentStrategy,
  type DeploymentStrategyType,
} from './deploymentStrategy';
import { ResourceMutationModal } from '../../actions/ResourceMutationModal';
import { useResourceMutation, type MutationTarget } from '../../actions/useResourceMutation';

const RADIO_NAME = 'update-strategy-type';
const ROLLING_ID = 'update-strategy-rolling-update';
const RECREATE_ID = 'update-strategy-recreate';
const boundSchema = z.string().trim();
const strategySchema = z
  .object({ type: z.enum(['RollingUpdate', 'Recreate']), maxUnavailable: boundSchema, maxSurge: boundSchema })
  .superRefine((values, ctx) => {
    // The bounds only matter for RollingUpdate; OCP disables them for Recreate, so they can't block its Save.
    if (values.type !== 'RollingUpdate') return;
    for (const field of ['maxUnavailable', 'maxSurge'] as const) {
      const text = values[field];
      if (!isValidBound(text)) {
        ctx.addIssue({ code: 'custom', path: [field], message: INT_OR_PERCENT_MESSAGE });
      }
    }
  });

type StrategyFormValues = z.infer<typeof strategySchema>;
/** The form's starting values from `spec.strategy`; missing bounds start at OCP's 25%. */
function initialValues(deployment: Deployment): StrategyFormValues {
  const strategy = deployment.spec?.strategy;
  const rolling = strategy?.rollingUpdate;
  return {
    type: strategy?.type === 'Recreate' ? 'Recreate' : 'RollingUpdate',
    maxUnavailable: String(rolling?.maxUnavailable ?? DEFAULT_BOUND),
    maxSurge: String(rolling?.maxSurge ?? DEFAULT_BOUND),
  };
}

/** What {@link useUpdateStrategy} writes. */
interface UpdateStrategyVars extends MutationTarget {
  strategy: DeploymentStrategy;
}

/**
 * Saves a deployment's update strategy as one JSON Patch `replace /spec/strategy`, so switching to Recreate drops
 * `rollingUpdate` in the same write (needs `patch deployments`).
 */
function useUpdateStrategy(cluster: string) {
  return useResourceMutation(cluster, {
    model: DeploymentModel,
    mutationFn: ({ namespace, name, strategy }: UpdateStrategyVars) =>
      k8sPatch(cluster, DeploymentModel, { namespace, name }, [
        { op: 'replace', path: '/spec/strategy', value: strategy },
      ]),
    successMessage: ({ name }) => `Update strategy saved for ${name}`,
  });
}

/** Props for {@link BoundField}. */
interface BoundFieldProps {
  control: Control<StrategyFormValues>;
  name: 'maxUnavailable' | 'maxSurge';
  label: string;
  /** Text after the input, e.g. "of pods". */
  suffix: string;
  helperText: string;
  isDisabled: boolean;
}

/**
 * One rolling-update bound as OCP renders it: a text input (placeholder 25%) with a "Current desired pod count"
 * tooltip on its unit suffix and the help text below, replaced by the validation error when invalid.
 */
function BoundField({ control, name, label, suffix, helperText, isDisabled }: BoundFieldProps) {
  // Destructured so the React compiler lint sees `ref` as the only ref (as the shared `TextField`).
  const {
    field: { ref, value, onChange, onBlur, name: fieldName },
    fieldState,
  } = useController({ control, name });
  const a11y = fieldA11y(name, fieldState.error, helperText);
  return (
    <FormGroup label={label} fieldId={a11y.fieldId}>
      <InputGroup>
        <InputGroupItem isFill>
          <TextInput
            ref={ref}
            id={a11y.fieldId}
            name={fieldName}
            type="text"
            placeholder={DEFAULT_BOUND}
            value={value}
            onChange={(_event, text) => onChange(text)}
            onBlur={onBlur}
            isDisabled={isDisabled}
            validated={a11y.isInvalid ? 'error' : 'default'}
            aria-invalid={a11y.isInvalid}
            aria-describedby={a11y.describedBy}
          />
        </InputGroupItem>
        <Tooltip content="Current desired pod count">
          <InputGroupText>{suffix}</InputGroupText>
        </Tooltip>
      </InputGroup>
      <FieldHelperText id={a11y.helperId} error={fieldState.error} helperText={helperText} />
    </FormGroup>
  );
}

/** Props for {@link ConfigureUpdateStrategyModal}. */
export interface ConfigureUpdateStrategyModalProps {
  cluster: string;
  deployment: Deployment & K8sResource;
  onClose: () => void;
}

/**
 * "Edit update strategy" (OCP `configure-update-strategy-modal.tsx`, DEP-8): "RollingUpdate (default)" with Max
 * unavailable / Max surge (a pod count or a percentage; blank saves 25%, as OCP) or "Recreate", prefilled from
 * `spec.strategy`. Invalid bounds are field errors that disable Save (OCP itself does not validate). The checked radio
 * has focus on open, as OCP's `autoFocus`. Closes on success; a failure stays inline.
 */
export function ConfigureUpdateStrategyModal({
  cluster,
  deployment,
  onClose,
}: ConfigureUpdateStrategyModalProps) {
  const defaultValues = initialValues(deployment);
  const { control, handleSubmit, formState, trigger } = useForm<StrategyFormValues>({
    resolver: zodResolver(strategySchema),
    defaultValues,
    mode: 'onChange',
  });
  const { field: typeField } = useController({ control, name: 'type' });
  const mutation = useUpdateStrategy(cluster);
  const namespace = deployment.metadata.namespace;
  const name = deployment.metadata.name ?? '';
  const replicas = deployment.spec?.replicas ?? 1;
  const isRecreate = typeField.value === 'Recreate';

  const setType = (type: DeploymentStrategyType) => {
    typeField.onChange(type);
    // The bounds' errors depend on the type: re-check them so Recreate clears and RollingUpdate restores them.
    void trigger(['maxUnavailable', 'maxSurge']);
  };

  const save = handleSubmit((values) => {
    mutation.mutate({ namespace, name, strategy: toDeploymentStrategy(values) }, { onSuccess: onClose });
  });

  return (
    <ResourceMutationModal
      title="Edit update strategy"
      cluster={cluster}
      namespace={namespace}
      objectName={name}
      kindLabel={DeploymentModel.label}
      isSaving={mutation.isPending}
      error={mutation.error}
      onSave={() => void save()}
      onClose={onClose}
      elementToFocus={`#${defaultValues.type === 'Recreate' ? RECREATE_ID : ROLLING_ID}`}
      isSaveDisabled={Object.keys(formState.errors).length > 0}
    >
      {/* Plain text: a non-first FormSection would add PF's 32px top margin below the context line. */}
      <Content component="p">How should the pods be replaced when a new revision is created?</Content>
      <Radio
        id={ROLLING_ID}
        name={RADIO_NAME}
        value="RollingUpdate"
        isChecked={!isRecreate}
        onChange={(_event, checked) => setType(checked ? 'RollingUpdate' : 'Recreate')}
        label="RollingUpdate (default)"
        description="Execute a smooth roll out of the new revision, based on the settings below"
        body={
          <FormSection>
            <BoundField
              control={control}
              name="maxUnavailable"
              label="Max unavailable"
              suffix={replicas === 1 ? 'of pod' : 'of pods'}
              helperText="Percentage of total number of pods or the maximum number of pods that can be unavailable during the update(optional)"
              isDisabled={isRecreate}
            />
            <BoundField
              control={control}
              name="maxSurge"
              label="Max surge"
              suffix={replicas === 1 ? 'greater than pod' : 'greater than pods'}
              helperText="Percentage of total number of pods or the maximum number of pods that can be scheduled above the original number of pods(optional)"
              isDisabled={isRecreate}
            />
          </FormSection>
        }
      />
      <Radio
        id={RECREATE_ID}
        name={RADIO_NAME}
        value="Recreate"
        isChecked={isRecreate}
        onChange={(_event, checked) => setType(checked ? 'Recreate' : 'RollingUpdate')}
        label="Recreate"
        description="Shut down all existing pods before creating new ones"
      />
    </ResourceMutationModal>
  );
}
