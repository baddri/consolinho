import {
  ExpandableSection,
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
  Spinner,
} from '@patternfly/react-core';
import { useController } from 'react-hook-form';
import type { DeploymentSectionProps } from './DeploymentFormSection';
import { FilterSelect } from './FilterSelect';
import { usePullSecrets } from './usePullSecrets';

/** Props for {@link AdvancedImageOptions}. */
export interface AdvancedImageOptionsProps extends DeploymentSectionProps {
  /** The cluster and namespace whose image pull secrets are offered. */
  cluster: string;
  namespace: string | undefined;
}

const PLACEHOLDER = 'Select Secret name';
const FIELD_ID = 'image-pull-secret';

/**
 * OCP `AdvancedImageOptions`: a collapsed "Show advanced image options" section with the "Pull Secret" select
 * (`ResourceDropdownField`, the namespace's dockercfg/dockerconfigjson Secrets, filterable). The toggle shows a spinner
 * while loading and "Error loading" when the list fails, as OCP's `ResourceDropdown`. OCP's "Create new Secret" link is
 * left out (no create-image-secret modal yet).
 */
export function AdvancedImageOptions({ control, cluster, namespace }: AdvancedImageOptionsProps) {
  const { field } = useController({ control, name: 'imagePullSecret' });
  const secrets = usePullSecrets(cluster, namespace);
  const helperId = `${FIELD_ID}-helper`;
  // OCP `ResourceDropdown` title order: loading, then the error, then the selection, else the placeholder.
  const toggleContent = secrets.isPending ? (
    <Spinner size="md" aria-label="Loading" />
  ) : secrets.isError ? (
    <span className="pf-v6-u-text-color-status-danger">{`Error loading - ${PLACEHOLDER}`}</span>
  ) : (
    field.value || PLACEHOLDER
  );
  return (
    <ExpandableSection
      toggleTextCollapsed="Show advanced image options"
      toggleTextExpanded="Hide advanced image options"
    >
      <FormGroup fieldId={FIELD_ID} label="Pull Secret">
        <FilterSelect
          id={FIELD_ID}
          toggleContent={toggleContent}
          selected={field.value}
          groups={[{ options: secrets.names.map((name) => ({ value: name, label: name, text: name })) }]}
          searchPlaceholder={PLACEHOLDER}
          describedBy={helperId}
          onSelect={field.onChange}
        />
        <FormHelperText>
          <HelperText id={helperId}>
            <HelperTextItem>
              Secret for authentication when pulling image from a secured registry.
            </HelperTextItem>
          </HelperText>
        </FormHelperText>
      </FormGroup>
    </ExpandableSection>
  );
}
