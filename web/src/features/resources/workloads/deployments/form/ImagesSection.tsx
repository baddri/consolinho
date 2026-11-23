import { FormGroup } from '@patternfly/react-core';
import { useState } from 'react';
import { useWatch } from 'react-hook-form';
import { TextField } from '@/shared/forms';
import { KindBadge } from '@/shared/ui';
import { DeploymentFormSection, type DeploymentSectionProps } from './DeploymentFormSection';
import { DropdownField } from './DropdownField';
import styles from './EditDeployment.module.css';

/**
 * "Images" (OCP `ImagesSection` + `ContainerField` + `ContainerImageField`): the container being edited, then its
 * required "Image Name". OCP edits only the first container and names it ("Container: [C] web"); with more than one
 * container a "Container" dropdown picks which one, and each keeps its own value (keyed by name). OCP's image stream
 * tag option and auto-deploy triggers are left out (no ImageStream pages yet).
 */
export function ImagesSection({ control }: DeploymentSectionProps) {
  const images = useWatch({ control, name: 'images' });
  const [selected, setSelected] = useState(0);
  const index = selected < images.length ? selected : 0;
  if (images.length === 0) return null;
  const options = images.map(({ name }, position) => ({ value: String(position), label: name }));
  return (
    <DeploymentFormSection title="Images">
      {images.length > 1 ? (
        <DropdownField
          id="deployment-container"
          label="Container"
          value={String(index)}
          options={options}
          onChange={(value) => setSelected(Number(value))}
        />
      ) : (
        <FormGroup fieldId="container-name">
          <span className={styles.containerName}>
            Container: <KindBadge kind="Container" /> {images[0]?.name}
          </span>
        </FormGroup>
      )}
      <TextField
        key={index}
        control={control}
        name={`images.${index}.image`}
        label="Image Name"
        helperText="Container image name"
        isRequired
      />
    </DeploymentFormSection>
  );
}
