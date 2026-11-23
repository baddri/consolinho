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

/** One item of a {@link DropdownField}. */
export interface DropdownFieldOption {
  value: string;
  label: string;
}

/** Props for {@link DropdownField}. */
export interface DropdownFieldProps {
  id: string;
  label: string;
  value: string;
  options: readonly DropdownFieldOption[];
  onChange: (value: string) => void;
  helperText?: string;
  isDisabled?: boolean;
}

/**
 * OCP's `DropdownField` with `fullWidth`: a labelled single `Select` whose full-width toggle shows the selected item's
 * label, with help text below. Controlled, so it serves both form values (via `useController`) and view state (the
 * container being edited).
 */
export function DropdownField({
  id,
  label,
  value,
  options,
  onChange,
  helperText,
  isDisabled,
}: DropdownFieldProps) {
  const [isOpen, setIsOpen] = useState(false);
  const selected = options.find((option) => option.value === value);
  const helperId = `${id}-helper`;
  return (
    <FormGroup fieldId={id} label={label}>
      <Select
        isOpen={isOpen}
        selected={value}
        onOpenChange={setIsOpen}
        onOpenChangeKeys={['Escape', 'Tab']}
        shouldFocusToggleOnSelect
        onSelect={(_event, next) => {
          if (typeof next === 'string' && next !== value) onChange(next);
          setIsOpen(false);
        }}
        toggle={(toggleRef: Ref<MenuToggleElement>) => (
          <MenuToggle
            ref={toggleRef}
            id={id}
            isFullWidth
            isExpanded={isOpen}
            isDisabled={isDisabled}
            aria-describedby={helperText ? helperId : undefined}
            onClick={() => setIsOpen((open) => !open)}
          >
            {selected?.label ?? value}
          </MenuToggle>
        )}
      >
        <SelectList aria-label={label}>
          {options.map((option) => (
            <SelectOption key={option.value} value={option.value}>
              {option.label}
            </SelectOption>
          ))}
        </SelectList>
      </Select>
      {helperText && (
        <FormHelperText>
          <HelperText id={helperId}>
            <HelperTextItem>{helperText}</HelperTextItem>
          </HelperText>
        </FormHelperText>
      )}
    </FormGroup>
  );
}
