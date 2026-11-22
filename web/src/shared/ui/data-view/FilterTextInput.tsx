import { TextInput } from '@patternfly/react-core';
import { useEffect, useRef, type FocusEventHandler, type KeyboardEventHandler } from 'react';
import styles from './ConsoleDataView.module.css';

/** Props for {@link FilterTextInput}. */
export interface FilterTextInputProps {
  /** Placeholder, also the accessible name ("Filter by name"). */
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  /** Whether `/` focuses this input: only the active filter category's input takes the shortcut. */
  isShortcutActive?: boolean;
  onFocus?: FocusEventHandler<HTMLInputElement>;
  onKeyDown?: KeyboardEventHandler<HTMLInputElement>;
  /** Focus on mount, as OCP's Events page text filter (`events.tsx` `autoFocus`). */
  autoFocus?: boolean;
}

/** True when the key press started in a field that takes text itself. */
function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
  );
}

/**
 * OCP `TextFilter` (`public/components/factory/text-filter.tsx`): a text input with the `/` keyboard-shortcut hint in
 * its right edge; `/` pressed outside a text field focuses it while `isShortcutActive`.
 */
export function FilterTextInput({
  placeholder,
  value,
  onChange,
  isShortcutActive,
  onFocus,
  onKeyDown,
  autoFocus,
}: FilterTextInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isShortcutActive) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey || isTyping(event.target))
        return;
      event.preventDefault();
      inputRef.current?.focus();
    };
    globalThis.addEventListener('keydown', onKeyDown);
    return () => globalThis.removeEventListener('keydown', onKeyDown);
  }, [isShortcutActive]);

  return (
    <div className={styles.textFilter}>
      <TextInput
        ref={inputRef}
        type="text"
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(_event, next) => onChange(next)}
        onFocus={onFocus}
        onKeyDown={onKeyDown}
        // Opt-in only, for a page whose main task is this filter (OCP Events page autofocuses it).
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus={autoFocus}
      />
      <span className={styles.feedback}>
        <kbd className={styles.kbd}>/</kbd>
      </span>
    </div>
  );
}
