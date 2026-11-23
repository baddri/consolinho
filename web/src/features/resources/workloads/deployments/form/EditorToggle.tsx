import { FormGroup, Radio } from '@patternfly/react-core';
import styles from './EditDeployment.module.css';
import type { EditorType } from './useEditorType';

/** Props for {@link EditorToggle}. */
export interface EditorToggleProps {
  value: EditorType;
  onChange: (type: EditorType) => void;
}

const OPTIONS: { value: EditorType; label: string }[] = [
  { value: 'form', label: 'Form view' },
  { value: 'yaml', label: 'YAML view' },
];

/**
 * "Configure via: ( ) Form view ( ) YAML view" (OCP `SyncedEditorField` toggle, an inline `RadioGroupField`): a
 * full-bleed row between two dividers at the top of the form. Choosing a view only asks `onChange`; whether the
 * switch happens (invalid YAML) is the caller's decision.
 */
export function EditorToggle({ value, onChange }: EditorToggleProps) {
  return (
    <div className={styles.editorToggle}>
      <FormGroup
        className={styles.inlineRadioGroup}
        role="radiogroup"
        fieldId="editor-type"
        label="Configure via:"
        isInline
      >
        {OPTIONS.map((option) => (
          <Radio
            key={option.value}
            id={`editor-type-${option.value}`}
            name="editor-type"
            value={option.value}
            label={option.label}
            isChecked={value === option.value}
            onChange={() => onChange(option.value)}
          />
        ))}
      </FormGroup>
    </div>
  );
}
