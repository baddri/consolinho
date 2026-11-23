import {
  InputGroup,
  InputGroupItem,
  MenuToggle,
  Select,
  SelectList,
  SelectOption,
} from '@patternfly/react-core';
import { RhUiFilterIcon } from '@patternfly/react-icons';
import { useState } from 'react';
import { FilterTextInput } from '@/shared/ui';
import { labelError } from '../actions/labelValidation';

type FilterType = 'Label' | 'Name';

/** Props for {@link SearchFilterInput}. */
export interface SearchFilterInputProps {
  /** The name input as typed. */
  nameInput: string;
  onNameChange: (value: string) => void;
  /** Called with a valid `key=value` (or `key`) when Enter is pressed in Label mode. */
  onAddLabel: (label: string) => void;
}

/**
 * OCP's search filter (`search-filter-dropdown.tsx`): a Label/Name select (filter icon, Name by default like other
 * lists) joined to the shared `/`-shortcut text filter (OCP `text-filter.tsx`). In Name mode typing filters by name; in Label mode Enter adds the typed
 * `key=value` as a label chip and empties the input — invalid text is ignored, as in OCP.
 */
export function SearchFilterInput({ nameInput, onNameChange, onAddLabel }: SearchFilterInputProps) {
  const [type, setType] = useState<FilterType>('Name');
  const [isOpen, setIsOpen] = useState(false);
  const [labelInput, setLabelInput] = useState('');

  const addLabel = () => {
    const label = labelInput.trim();
    if (label === '' || labelError(label) !== undefined) return;
    onAddLabel(label);
    setLabelInput('');
  };

  return (
    <InputGroup>
      <InputGroupItem>
        <Select
          isOpen={isOpen}
          selected={type}
          onSelect={(_event, value) => {
            const next = String(value);
            if (next === 'Label' || next === 'Name') setType(next);
            setIsOpen(false);
          }}
          onOpenChange={setIsOpen}
          shouldFocusToggleOnSelect
          toggle={(toggleRef) => (
            <MenuToggle
              ref={toggleRef}
              isExpanded={isOpen}
              onClick={() => setIsOpen((open) => !open)}
              icon={<RhUiFilterIcon />}
            >
              {type}
            </MenuToggle>
          )}
        >
          <SelectList>
            <SelectOption value="Label">Label</SelectOption>
            <SelectOption value="Name">Name</SelectOption>
          </SelectList>
        </Select>
      </InputGroupItem>
      <InputGroupItem isFill>
        <FilterTextInput
          isShortcutActive
          placeholder={type === 'Label' ? 'app=frontend' : 'my-resource'}
          value={type === 'Label' ? labelInput : nameInput}
          onChange={(value) => (type === 'Label' ? setLabelInput(value) : onNameChange(value))}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && type === 'Label') {
              event.preventDefault();
              addLabel();
            }
          }}
        />
      </InputGroupItem>
    </InputGroup>
  );
}
