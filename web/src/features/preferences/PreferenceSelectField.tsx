import {
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
  MenuToggle,
  Select,
  SelectList,
  SelectOption,
  type MenuToggleElement,
} from '@patternfly/react-core';
import { useState, type Ref } from 'react';

/** One choice of a {@link PreferenceSelectField}. */
export interface PreferenceOption<T extends string> {
  value: T;
  label: string;
  /** Shown under the label in the menu (OCP option `description`). */
  description?: string;
}

/** Props for {@link PreferenceSelectField}. */
export interface PreferenceSelectFieldProps<T extends string> {
  id: string;
  label: string;
  /** Helper text under the select. */
  description: string;
  options: readonly PreferenceOption<T>[];
  value: T;
  /** Called with the new value; the caller saves it at once (autosave, no Save button). */
  onChange: (value: T) => void;
}

/**
 * One user preference as a full-width single `Select` with helper text, like OCP's `UserPreferenceField` +
 * `UserPreferenceDropdownField`. Selecting an option applies it immediately.
 */
export function PreferenceSelectField<T extends string>({
  id,
  label,
  description,
  options,
  value,
  onChange,
}: PreferenceSelectFieldProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const selected = options.find((option) => option.value === value);

  return (
    <FormGroup fieldId={id} label={label}>
      <Select
        isOpen={isOpen}
        selected={value}
        onOpenChange={setIsOpen}
        onSelect={(_event, next) => {
          const option = options.find((candidate) => candidate.value === next);
          if (option && option.value !== value) onChange(option.value);
          setIsOpen(false);
        }}
        toggle={(toggleRef: Ref<MenuToggleElement>) => (
          <MenuToggle
            ref={toggleRef}
            id={id}
            isFullWidth
            isExpanded={isOpen}
            onClick={() => setIsOpen((open) => !open)}
          >
            {selected?.label ?? 'Select an option'}
          </MenuToggle>
        )}
      >
        <SelectList aria-label={label}>
          {options.map((option) => (
            <SelectOption key={option.value} value={option.value} description={option.description}>
              {option.label}
            </SelectOption>
          ))}
        </SelectList>
      </Select>
      <FormHelperText>
        <HelperText>
          <HelperTextItem>{description}</HelperTextItem>
        </HelperText>
      </FormHelperText>
    </FormGroup>
  );
}
