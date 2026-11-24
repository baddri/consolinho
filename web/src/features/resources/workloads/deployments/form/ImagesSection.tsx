import { TextField } from '@/shared/forms';
import { ContainerField, type ContainerChoice } from './ContainerField';
import { DeploymentFormSection, type DeploymentSectionProps } from './DeploymentFormSection';

/** Props for {@link ImagesSection}. */
export interface ImagesSectionProps extends DeploymentSectionProps {
  container: ContainerChoice;
}

/**
 * "Images" (OCP `ImagesSection` + `ContainerField` + `ContainerImageField`): the container being edited, then its
 * required "Image Name". Each container keeps its own value (written back by name). OCP's image stream tag option
 * and auto-deploy triggers are left out (no ImageStream pages yet).
 */
export function ImagesSection({ control, container }: ImagesSectionProps) {
  if (container.names.length === 0) return null;
  return (
    <DeploymentFormSection title="Images">
      <ContainerField id="images-container" {...container} />
      <TextField
        key={container.index}
        control={control}
        name={`containers.${container.index}.image`}
        label="Image Name"
        helperText="Container image name"
        isRequired
      />
    </DeploymentFormSection>
  );
}
