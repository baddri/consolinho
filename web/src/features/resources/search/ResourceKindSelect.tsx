import {
  Button,
  MenuToggle,
  Select,
  SelectList,
  SelectOption,
  TextInputGroup,
  TextInputGroupMain,
  TextInputGroupUtilities,
} from '@patternfly/react-core';
import { TimesIcon } from '@patternfly/react-icons';
import { useId, useMemo, useState, type KeyboardEvent } from 'react';
import type { K8sModel } from '@/shared/k8s';
import { KindBadge } from '../components/KindBadge';
import { toRef } from './kindRef';
import styles from './SearchPage.module.css';

/** Props for {@link ResourceKindSelect}. */
export interface ResourceKindSelectProps {
  /** Kinds on offer (registered and served by the cluster). */
  models: readonly K8sModel[];
  /** Selected kind references ({@link toRef}). */
  selected: readonly string[];
  /** Toggles one kind reference. */
  onToggle: (ref: string) => void;
}

/** One option: the model and its reference. */
interface KindOption {
  ref: string;
  model: K8sModel;
}

const matches = (model: K8sModel, text: string) =>
  [model.kind, model.labelPlural, model.plural].some((field) => field.toLowerCase().includes(text));

/**
 * OCP's resource dropdown (`resource-dropdown.tsx`): a PF6 multiple typeahead with checkboxes. Placeholder "Resources"
 * (or "Resources (N)" with a selection); options show the kind badge and kind, plus `group/version` when two kinds
 * share a name. Choosing an option toggles it and keeps the menu open; typing filters by kind, plural label or plural.
 * Arrow keys move a highlight announced with `aria-activedescendant`; Enter toggles it.
 */
export function ResourceKindSelect({ models, selected, onToggle }: ResourceKindSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const idPrefix = useId();
  const listId = `${idPrefix}-listbox`;
  const optionId = (index: number) => `${idPrefix}-option-${index}`;

  const allOptions = useMemo<KindOption[]>(
    () =>
      [...models]
        .sort((a, b) => a.kind.localeCompare(b.kind))
        .map((model) => ({ ref: toRef(model), model })),
    [models],
  );
  const duplicateKinds = useMemo(() => {
    const counts = new Map<string, number>();
    for (const { kind } of models) counts.set(kind, (counts.get(kind) ?? 0) + 1);
    return new Set([...counts].filter(([, count]) => count > 1).map(([kind]) => kind));
  }, [models]);

  const text = inputValue.trim().toLowerCase();
  const options = text ? allOptions.filter(({ model }) => matches(model, text)) : allOptions;
  const focused = isOpen && focusedIndex !== null ? options[focusedIndex] : undefined;

  const close = () => {
    setIsOpen(false);
    setFocusedIndex(null);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setIsOpen(true);
      if (options.length === 0) return;
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setFocusedIndex((index) =>
        index === null || !isOpen
          ? step === 1
            ? 0
            : options.length - 1
          : (index + step + options.length) % options.length,
      );
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (focused) onToggle(focused.ref);
      else setIsOpen(true);
    } else if (event.key === 'Escape' && isOpen) {
      event.stopPropagation();
      close();
    }
  };

  return (
    <Select
      variant="typeahead"
      role="menu"
      isOpen={isOpen}
      selected={selected}
      onSelect={(_event, value) => {
        if (typeof value === 'string' && value !== '') onToggle(value);
      }}
      onOpenChange={(open) => {
        if (!open) close();
      }}
      shouldFocusFirstItemOnOpen={false}
      isScrollable
      maxMenuHeight="60vh"
      toggle={(toggleRef) => (
        <MenuToggle
          ref={toggleRef}
          variant="typeahead"
          isExpanded={isOpen}
          onClick={() => setIsOpen((open) => !open)}
        >
          <TextInputGroup isPlain>
            <TextInputGroupMain
              value={inputValue}
              placeholder={selected.length > 0 ? `Resources (${selected.length})` : 'Resources'}
              aria-label="Resources"
              role="combobox"
              isExpanded={isOpen}
              aria-controls={listId}
              aria-activedescendant={
                focused !== undefined && focusedIndex !== null ? optionId(focusedIndex) : undefined
              }
              inputProps={{ autoComplete: 'off' }}
              onClick={() => setIsOpen((open) => !open || inputValue !== '')}
              onChange={(_event, value) => {
                setInputValue(value);
                setFocusedIndex(null);
                if (value) setIsOpen(true);
              }}
              onKeyDown={onKeyDown}
            />
            {inputValue !== '' && (
              <TextInputGroupUtilities>
                <Button
                  variant="plain"
                  aria-label="Clear input value"
                  icon={<TimesIcon />}
                  onClick={() => {
                    setInputValue('');
                    setFocusedIndex(null);
                  }}
                />
              </TextInputGroupUtilities>
            )}
          </TextInputGroup>
        </MenuToggle>
      )}
    >
      <SelectList id={listId} isAriaMultiselectable aria-label="Resources">
        {options.map(({ ref, model }, index) => (
          <SelectOption
            key={ref}
            value={ref}
            id={optionId(index)}
            hasCheckbox
            isSelected={selected.includes(ref)}
            isFocused={focusedIndex === index}
          >
            <span className={styles.kindItem}>
              <span className={styles.kindIcon}>
                <KindBadge model={model} />
              </span>
              <span>
                {model.kind}
                {duplicateKinds.has(model.kind) && (
                  <span className="pf-v6-u-display-block pf-v6-u-font-size-xs pf-v6-u-text-color-subtle">
                    {model.group || 'core'}/{model.version}
                  </span>
                )}
              </span>
            </span>
          </SelectOption>
        ))}
        {options.length === 0 && (
          <SelectOption isAriaDisabled value="">
            No results found
          </SelectOption>
        )}
      </SelectList>
    </Select>
  );
}
