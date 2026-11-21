import { MenuToggle, Select, SelectList, SelectOption } from '@patternfly/react-core';
import { DesktopIcon, MoonIcon, SunIcon } from '@patternfly/react-icons';
import { useState, type ReactNode } from 'react';
import { useTheme, type ThemePreference } from '@/shared/theme';

const OPTIONS: readonly { value: ThemePreference; label: string; icon: ReactNode }[] = [
  { value: 'light', label: 'Light', icon: <SunIcon /> },
  { value: 'dark', label: 'Dark', icon: <MoonIcon /> },
  { value: 'system', label: 'System', icon: <DesktopIcon /> },
];

const isPreference = (value: unknown): value is ThemePreference =>
  OPTIONS.some((option) => option.value === value);

/**
 * Masthead theme chooser (UX.md §2): a plain icon toggle showing the current preference (sun / moon / desktop) that
 * opens Light / Dark / System. A single-select PF `Select` rather than a `Dropdown`, so the current choice is
 * announced as selected (`aria-selected`), not only shown by the check mark.
 */
export function ThemeMenu() {
  const { preference, setPreference } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const current = OPTIONS.find((option) => option.value === preference) ?? OPTIONS[2];

  return (
    <Select
      isOpen={isOpen}
      selected={preference}
      onSelect={(_event, value) => {
        if (isPreference(value)) setPreference(value);
        setIsOpen(false);
      }}
      onOpenChange={setIsOpen}
      popperProps={{ position: 'end' }}
      toggle={(toggleRef) => (
        <MenuToggle
          ref={toggleRef}
          variant="plain"
          aria-label="Theme"
          icon={current?.icon}
          isExpanded={isOpen}
          onClick={() => setIsOpen((open) => !open)}
        />
      )}
    >
      <SelectList aria-label="Theme">
        {OPTIONS.map((option) => (
          <SelectOption key={option.value} value={option.value} icon={option.icon}>
            {option.label}
          </SelectOption>
        ))}
      </SelectList>
    </Select>
  );
}
