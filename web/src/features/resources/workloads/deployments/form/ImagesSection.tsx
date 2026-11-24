import { TextField } from '@/shared/forms';
import { AdvancedImageOptions } from './AdvancedImageOptions';
import { ContainerField, type ContainerChoice } from './ContainerField';
import { DeploymentFormSection, type DeploymentSectionProps } from './DeploymentFormSection';

/** Props for {@link ImagesSection}. */
export interface ImagesSectionProps extends DeploymentSectionProps {
  container: ContainerChoice;
  /** The cluster and namespace whose image pull secrets "Pull Secret" offers. */
  cluster: string;
  namespace: string | undefined;
}

/**
 * "Images" (OCP `ImagesSection` + `ContainerField` + `ContainerImageField`): the container being edited, then its
 * required "Image Name", then the collapsed advanced image options (Pull Secret). Each container keeps its own value (written back by name). OCP's image stream tag option
 * and auto-deploy triggers are left out (no ImageStream pages yet).
 */
export function ImagesSection({ control, container, cluster, namespace }: ImagesSectionProps) {
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
      <AdvancedImageOptions control={control} cluster={cluster} namespace={namespace} />
    </DeploymentFormSection>
  );
}
