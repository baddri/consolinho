import { FormHelperText, FormSection } from '@patternfly/react-core';
import { css } from '@patternfly/react-styles';
import type { ReactNode } from 'react';
import type { Control } from 'react-hook-form';
import type { DeploymentFormValues } from './deploymentFormSchema';
import styles from './EditDeployment.module.css';

/** Props of the form's sections: the Edit Deployment form's control. */
export interface DeploymentSectionProps {
  control: Control<DeploymentFormValues>;
}

/** Props for {@link DeploymentFormSection}. */
export interface DeploymentFormSectionProps {
  title: string;
  subTitle?: string;
  /** Spans the whole body instead of the 650px form column (OCP `fullWidth`). */
  fullWidth?: boolean;
  children: ReactNode;
}

/** An OCP dev-console `FormSection`: `h2` title, optional helper sub-title, capped at 650px unless `fullWidth`. */
export function DeploymentFormSection({
  title,
  subTitle,
  fullWidth = false,
  children,
}: DeploymentFormSectionProps) {
  return (
    <FormSection
      title={title}
      titleElement="h2"
      className={css(styles.section, !fullWidth && styles.paneForm)}
    >
      {subTitle && <FormHelperText>{subTitle}</FormHelperText>}
      {children}
    </FormSection>
  );
}
