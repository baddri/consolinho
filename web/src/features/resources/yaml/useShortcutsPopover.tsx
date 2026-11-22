import { ShortcutGrid } from '@patternfly/react-component-groups';
import type { PopoverProps } from '@patternfly/react-core';
import { useMemo } from 'react';

const isMac = globalThis.navigator.userAgent.includes('Mac');

/**
 * The YAML editor's "Shortcuts" popover (OCP `console-shared/src/components/editor/ShortcutsPopover.tsx`): the Monaco
 * key bindings worth knowing, with the platform's modifier keys.
 */
export function useShortcutsPopover(): PopoverProps {
  return useMemo(
    () => ({
      'aria-label': 'Shortcuts',
      bodyContent: (
        <ShortcutGrid
          shortcuts={[
            { keys: ['F1'], description: 'View all editor shortcuts' },
            { keys: ['ctrl', 'space'], description: 'Activate auto complete' },
            {
              keys: isMac ? ['ctrl', 'shift', 'm'] : ['ctrl', 'm'],
              description: 'Toggle Tab action between insert Tab character and move focus out of editor',
            },
            {
              keys: isMac ? ['cmd', 'shift', 'o'] : ['ctrl', 'shift', 'o'],
              description: 'View document outline',
            },
            { keys: [], hover: true, description: 'View property descriptions' },
            { keys: isMac ? ['cmd', 's'] : ['ctrl', 's'], description: 'Save' },
          ]}
        />
      ),
      maxWidth: '35rem',
      distance: 18,
    }),
    [],
  );
}
