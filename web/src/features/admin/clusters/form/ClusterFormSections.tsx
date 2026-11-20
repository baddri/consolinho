import { Alert, Content, FormGroup, FormSection } from '@patternfly/react-core';
import { useWatch, type Control } from 'react-hook-form';
import {
  RadioGroupField,
  SwitchField,
  TextAreaField,
  TextField,
  type RadioGroupFieldOption,
} from '@/shared/forms';
import { EnvironmentLabel } from '@/shared/ui';
import { CaBundleField } from './CaBundleField';
import { CLUSTER_ENVIRONMENTS, type ClusterFormInput, type ClusterFormValues } from './clusterForm.schema';
import { PRODUCT_NAME } from '@/shared/branding';

/** The form's `control`, typed with the schema's input and output. */
type ClusterFormControl = Control<ClusterFormInput, unknown, ClusterFormValues>;

/** Props shared by the sections. */
interface SectionProps {
  control: ClusterFormControl;
  /** Edit mode: the name is immutable, the enabled state is changed elsewhere (CLU-5). */
  isEdit: boolean;
}

/** Radio text per environment; the coloured `EnvironmentLabel` next to it previews how the switcher shows it. */
const ENVIRONMENT_NAMES: Record<(typeof CLUSTER_ENVIRONMENTS)[number], string> = {
  production: 'Production',
  staging: 'Staging',
  development: 'Development',
};

const ENVIRONMENT_CHOICES: readonly RadioGroupFieldOption[] = CLUSTER_ENVIRONMENTS.map((environment) => ({
  value: environment,
  label: (
    <>
      {ENVIRONMENT_NAMES[environment]} <EnvironmentLabel environment={environment} isCompact />
    </>
  ),
}));

/** Identity: name (create only; plain text on edit), display name, environment and description. */
export function IdentitySection({ control, isEdit }: SectionProps) {
  const name = useWatch({ control, name: 'name' });
  return (
    <FormSection title="Identity" titleElement="h2">
      {isEdit ? (
        <FormGroup label="Name" fieldId="cluster-name-readonly">
          <Content component="p" id="cluster-name-readonly">
            {name}
          </Content>
        </FormGroup>
      ) : (
        <TextField
          control={control}
          name="name"
          label="Name"
          isRequired
          helperText="Lowercase letters, digits and '-' (max 40). Used in URLs; cannot be changed later."
          autoComplete="off"
          spellCheck={false}
        />
      )}
      <TextField
        control={control}
        name="displayName"
        label="Display name"
        placeholder={name}
        helperText="Shown in the cluster switcher; defaults to the name."
      />
      <RadioGroupField
        control={control}
        name="environment"
        label="Environment"
        isRequired
        isInline
        options={ENVIRONMENT_CHOICES}
      />
      <TextAreaField control={control} name="description" label="Description" resizeOrientation="vertical" />
    </FormSection>
  );
}

/**
 * Connection: API URL, CA bundle and Skip TLS (CLU-1..4). Turning Skip TLS on shows the man-in-the-middle warning; in
 * edit mode an info line says connection changes make stored test results stale.
 */
export function ConnectionSection({ control, isEdit }: SectionProps) {
  const skipTlsVerify = useWatch({ control, name: 'skipTlsVerify' });
  return (
    <FormSection title="Connection" titleElement="h2">
      {isEdit && (
        <Alert
          variant="info"
          isInline
          isPlain
          title="Changing the API URL, CA bundle or Skip TLS marks existing connection test results as stale."
        />
      )}
      <TextField
        control={control}
        name="apiUrl"
        label="API URL"
        isRequired
        type="url"
        placeholder="https://api.cluster.example.com:6443"
        autoComplete="off"
        spellCheck={false}
      />
      <CaBundleField control={control} />
      <SwitchField control={control} name="skipTlsVerify" label="Skip TLS verification" />
      {skipTlsVerify && (
        <Alert
          variant="warning"
          isInline
          title={`TLS verification is disabled — ${PRODUCT_NAME} cannot detect a man-in-the-middle. Prefer a CA bundle.`}
        />
      )}
    </FormSection>
  );
}

/** Links: the cluster's web console, offered as a shortcut elsewhere in the UI. */
export function LinksSection({ control }: Pick<SectionProps, 'control'>) {
  return (
    <FormSection title="Links" titleElement="h2">
      <TextField
        control={control}
        name="webConsoleUrl"
        label="Web console URL"
        type="url"
        placeholder="https://console-openshift-console.apps.cluster.example.com"
        autoComplete="off"
        spellCheck={false}
      />
    </FormSection>
  );
}

/** Status (create only): whether the new cluster is enabled right away. */
export function StatusSection({ control }: Pick<SectionProps, 'control'>) {
  return (
    <FormSection title="Status" titleElement="h2">
      <SwitchField
        control={control}
        name="isEnabled"
        label="Enabled"
        helperText="Disabled clusters are hidden from every cluster switcher."
      />
    </FormSection>
  );
}
