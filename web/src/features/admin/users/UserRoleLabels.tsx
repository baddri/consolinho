import { Label, LabelGroup, Tooltip } from '@patternfly/react-core';
import type { UserListItem } from '@/shared/api';

/** Props for {@link UserRoleLabels}; a `UserListItem` or `UserDetail` can be passed as is. */
export type UserRoleLabelsProps = Pick<
  UserListItem,
  'role' | 'isAdminViaConfiguration' | 'adminConfigurationSource'
>;

/**
 * Explains a configuration-sourced admin role (USR-6), e.g. "Admin granted by configuration (group
 * fleetconsole-admins)". Without a source (older representation) the parenthesis is left out.
 */
export function adminViaConfigurationText(source: string | null): string {
  return source ? `Admin granted by configuration (${source})` : 'Admin granted by configuration';
}

/**
 * A user's role (USR-1/USR-6): an "Admin" label for admins, plus a compact outlined "via config" label when the role
 * comes from `Auth:BootstrapAdminUsers`/`Auth:AdminGroups`, whose tooltip names the configuration source. Plain
 * users show the text "User". Shared by the users list and the user detail page.
 */
export function UserRoleLabels({
  role,
  isAdminViaConfiguration,
  adminConfigurationSource,
}: UserRoleLabelsProps) {
  if (role !== 'admin') {
    return <>User</>;
  }
  return (
    <LabelGroup aria-label="Role">
      <Label isCompact color="blue">
        Admin
      </Label>
      {isAdminViaConfiguration && (
        <Tooltip content={adminViaConfigurationText(adminConfigurationSource)}>
          {/* Focusable so keyboard users can open the tooltip (same pattern as RelativeTime). */}
          <Label isCompact variant="outline" tabIndex={0}>
            via config
          </Label>
        </Tooltip>
      )}
    </LabelGroup>
  );
}
