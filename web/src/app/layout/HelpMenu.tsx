import { Dropdown, DropdownItem, DropdownList, MenuToggle, type MenuToggleElement } from '@patternfly/react-core';
import { RhUiQuestionMarkCircleIcon } from '@patternfly/react-icons';
import { useState, type Ref } from 'react';
import { AboutModal } from './AboutModal';

/**
 * Masthead help menu like OCP's (`masthead-toolbar.tsx`, "Help menu"): a plain `?` icon toggle opening a dropdown.
 * OCP lists Documentation and About; Consolinho has no documentation site yet, so only About (UX.md §2), which opens
 * {@link AboutModal} with the version.
 */
export function HelpMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  return (
    <>
      <Dropdown
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        onSelect={() => setIsOpen(false)}
        popperProps={{ position: 'right' }}
        toggle={(toggleRef: Ref<MenuToggleElement>) => (
          <MenuToggle
            ref={toggleRef}
            variant="plain"
            aria-label="Help menu"
            isExpanded={isOpen}
            onClick={() => setIsOpen((open) => !open)}
          >
            <RhUiQuestionMarkCircleIcon />
          </MenuToggle>
        )}
      >
        <DropdownList>
          <DropdownItem onClick={() => setIsAboutOpen(true)}>About</DropdownItem>
        </DropdownList>
      </Dropdown>
      <AboutModal isOpen={isAboutOpen} onClose={() => setIsAboutOpen(false)} />
    </>
  );
}
