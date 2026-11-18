import { ToggleGroup, ToggleGroupItem } from '@patternfly/react-core';
import { MoonIcon, SunIcon } from '@patternfly/react-icons';
import { useTheme } from '@/shared/theme';

/** Light/dark theme switch in the masthead. */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  return (
    <ToggleGroup aria-label="Colour theme">
      <ToggleGroupItem
        icon={<SunIcon />}
        aria-label="Light theme"
        buttonId="theme-light"
        isSelected={theme === 'light'}
        onChange={() => setTheme('light')}
      />
      <ToggleGroupItem
        icon={<MoonIcon />}
        aria-label="Dark theme"
        buttonId="theme-dark"
        isSelected={theme === 'dark'}
        onChange={() => setTheme('dark')}
      />
    </ToggleGroup>
  );
}
