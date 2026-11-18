import {
  Dropdown,
  DropdownItem,
  DropdownList,
  MenuToggle,
  type MenuToggleElement,
} from '@patternfly/react-core';
import { UserIcon } from '@patternfly/react-icons';
import { useState, type Ref } from 'react';
import { useNavigate } from 'react-router';

/** Masthead user dropdown. Placeholder until authentication exists: no identity yet, only a link to the login page. */
export function UserMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();

  return (
    <Dropdown
      isOpen={isOpen}
      onOpenChange={setIsOpen}
      onSelect={() => setIsOpen(false)}
      popperProps={{ position: 'right' }}
      toggle={(toggleRef: Ref<MenuToggleElement>) => (
        <MenuToggle
          ref={toggleRef}
          onClick={() => setIsOpen((open) => !open)}
          isExpanded={isOpen}
          icon={<UserIcon />}
          variant="plainText"
          aria-label="User menu"
        >
          Not signed in
        </MenuToggle>
      )}
    >
      <DropdownList>
        <DropdownItem key="login" onClick={() => void navigate('/login')}>
          Log in
        </DropdownItem>
        <DropdownItem key="logout" isDisabled>
          Log out
        </DropdownItem>
      </DropdownList>
    </Dropdown>
  );
}
