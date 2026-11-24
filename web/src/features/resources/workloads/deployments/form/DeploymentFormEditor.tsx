import { Alert, AlertActionCloseButton, FormGroup, FormSection, TextInput } from '@patternfly/react-core';
import { useMemo, useState } from 'react';
import { useWatch, type UseFormSetValue } from 'react-hook-form';
import { AdvancedSection } from './AdvancedSection';
import type { ContainerChoice } from './ContainerField';
import type { DeploymentSectionProps } from './DeploymentFormSection';
import type { DeploymentFormValues } from './deploymentFormSchema';
import { DeploymentStrategySection } from './DeploymentStrategySection';
import { EnvironmentSection } from './EnvironmentSection';
import { ImagesSection } from './ImagesSection';
import styles from './EditDeployment.module.css';

/** Props for {@link DeploymentFormEditor}. */
export interface DeploymentFormEditorProps extends DeploymentSectionProps {
  /** The Deployment's name, shown read-only (OCP `NameSection` disables it when editing). */
  name: string;
  /** The cluster and namespace whose ConfigMaps/Secrets the images and environment sections offer. */
  cluster: string;
  namespace: string | undefined;
  /** Lets the environment section clear a ref's key without validating it. */
  setValue: UseFormSetValue<DeploymentFormValues>;
}

/**
 * The form view of Edit Deployment (OCP `DeploymentFormEditor`): the dismissible "Some fields might not be displayed"
 * hint, the read-only Name, then the sections in OCP's order: Deployment strategy, Images, Environment Variables,
 * Advanced options. Images and Environment Variables edit the same container, picked in either section.
 */
export function DeploymentFormEditor({
  control,
  name,
  cluster,
  namespace,
  setValue,
}: DeploymentFormEditorProps) {
  const [showYamlHint, setShowYamlHint] = useState(true);
  const [containerIndex, setContainerIndex] = useState(0);
  const containers = useWatch({ control, name: 'containers' });
  const names = useMemo(() => containers.map((container) => container.name), [containers]);
  const container: ContainerChoice = {
    names,
    // The YAML view can remove containers; never point past the end.
    index: Math.min(containerIndex, Math.max(names.length - 1, 0)),
    onChange: setContainerIndex,
  };
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
      <DeploymentStrategySection control={control} />
      <ImagesSection control={control} container={container} cluster={cluster} namespace={namespace} />
      <EnvironmentSection
        control={control}
        cluster={cluster}
        namespace={namespace}
        container={container}
        setValue={setValue}
      />
      <AdvancedSection control={control} />
    </>
  );
}
