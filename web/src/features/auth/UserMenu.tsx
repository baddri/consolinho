import {
  Content,
  Divider,
  Dropdown,
  DropdownItem,
  DropdownList,
  Label,
  MenuToggle,
  type MenuToggleElement,
} from '@patternfly/react-core';
import { UserIcon } from '@patternfly/react-icons';
import { useState, type Ref } from 'react';
import { errorMessage, type CurrentUser } from '@/shared/api';
import { useToast } from '@/shared/ui';
import { useCurrentUser } from './useCurrentUser';
import { useLogout } from './useLogout';

/** "3 groups" / "1 group" / "No groups" — the OCP groups seen at the last login. */
function groupsSummary(groups: readonly string[]): string {
  if (groups.length === 0) {
    return 'No groups';
  }
  return groups.length === 1 ? '1 group' : `${groups.length} groups`;
}

/** Toggle content: display name (or username) plus role/read-only badges (AUTH-9). */
function UserToggleContent({ user }: { user: CurrentUser }) {
  return (
    <>
      {user.displayName ?? user.username}
      {/* The spaces keep the accessible name readable ("Ines Auditor Admin Read only"). */}
      {user.role === 'admin' && (
        <>
          {' '}
          <Label isCompact color="blue">
            Admin
          </Label>
        </>
      )}
      {user.isReadOnly && (
        <>
          {' '}
          <Label isCompact color="orange">
            Read only
          </Label>
        </>
      )}
    </>
  );
}

/**
 * Masthead user menu (AUTH-9, AUTH-10). The toggle names the signed-in user and shows "Admin" / "Read only" badges;
 * the dropdown starts with a non-interactive header (username and group count) followed by "Log out".
 *
 * Rendered inside `RequireSession`, so the user is normally loaded; renders nothing otherwise. A failed logout is
 * reported as a toast and the user stays signed in.
 */
export function UserMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const { data: user } = useCurrentUser();
  const logout = useLogout();
  const toast = useToast();

  if (!user) {
    return null;
  }

  const onLogout = () =>
    logout.mutate(undefined, { onError: (error) => toast.danger('Could not log out', errorMessage(error)) });

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
        >
          <UserToggleContent user={user} />
        </MenuToggle>
      )}
    >
      <Content className="pf-v6-u-px-md pf-v6-u-py-sm">
        <Content component="p" className="pf-v6-u-m-0">
          Signed in as <strong>{user.username}</strong>
        </Content>
        <Content component="small">{groupsSummary(user.groups)}</Content>
      </Content>
      <Divider />
      <DropdownList>
        <DropdownItem key="logout" onClick={onLogout} isDisabled={logout.isPending}>
          Log out
        </DropdownItem>
      </DropdownList>
    </Dropdown>
  );
}
