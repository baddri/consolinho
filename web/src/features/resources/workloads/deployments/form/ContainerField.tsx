import { FormGroup } from '@patternfly/react-core';
import { KindBadge } from '@/shared/ui';
import { DropdownField } from './DropdownField';
import styles from './EditDeployment.module.css';

/** Which container the Images and Environment Variables sections edit; shared, so both show the same one. */
export interface ContainerChoice {
  /** The pod template's container names, in order. */
  names: readonly string[];
  /** Index into `names` of the container being edited. */
  index: number;
  onChange: (index: number) => void;
}

/** Props for {@link ContainerField}. */
export interface ContainerFieldProps extends ContainerChoice {
  /** The dropdown's id; each section has its own field. */
  id: string;
}

/**
 * OCP `ContainerField`: names the container a section edits ("Container: [C] web"). OCP only ever edits the first
 * container; with more than one, a "Container" dropdown picks which one instead.
 */
export function ContainerField({ id, names, index, onChange }: ContainerFieldProps) {
  if (names.length > 1) {
    return (
      <DropdownField
        id={id}
        label="Container"
        value={String(index)}
        options={names.map((name, position) => ({ value: String(position), label: name }))}
        onChange={(value) => onChange(Number(value))}
      />
    );
  }
  return (
    <FormGroup fieldId={id}>
      <span className={styles.containerName}>
        Container: <KindBadge kind="Container" /> {names[0]}
      </span>
    </FormGroup>
  );
}
