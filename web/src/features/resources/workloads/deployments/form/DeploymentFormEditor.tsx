import { Alert, AlertActionCloseButton, FormGroup, FormSection, TextInput } from '@patternfly/react-core';
import { useState } from 'react';
import { AdvancedSection, type DeploymentSectionProps } from './AdvancedSection';
import styles from './EditDeployment.module.css';

/** Props for {@link DeploymentFormEditor}. */
export interface DeploymentFormEditorProps extends DeploymentSectionProps {
  /** The Deployment's name, shown read-only (OCP `NameSection` disables it when editing). */
  name: string;
}

/**
 * The form view of Edit Deployment (OCP `DeploymentFormEditor`): the dismissible "Some fields might not be displayed"
 * hint, the read-only Name, then the sections in OCP's order. T-0215 adds Deployment strategy and Images, T-0216
 * Environment variables, between Name and Advanced options.
 */
export function DeploymentFormEditor({ control, name }: DeploymentFormEditorProps) {
  const [showYamlHint, setShowYamlHint] = useState(true);
  return (
    <>
      {showYamlHint && (
        <Alert
          variant="info"
          isInline
          title="Some fields might not be displayed in this form. Select YAML view to edit all fields."
          actionClose={<AlertActionCloseButton onClose={() => setShowYamlHint(false)} />}
        />
      )}
      <FormSection className={styles.paneForm}>
        <FormGroup label="Name" fieldId="deployment-name" isRequired>
          <TextInput id="deployment-name" value={name} isDisabled aria-required />
        </FormGroup>
      </FormSection>
      <AdvancedSection control={control} />
    </>
  );
}
