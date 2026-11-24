import { Alert } from '@patternfly/react-core';
import type { Control } from 'react-hook-form';
import { useGroups } from '../groups/api';
import type { GrantFormValues } from './grantForm.schema';
import { TypeaheadSelectField, type TypeaheadOption } from './TypeaheadSelectField';

/** Props for {@link GroupTypeahead}. */
export interface GroupTypeaheadProps {
  control: Control<GrantFormValues>;
  /** Groups that already hold a grant on the cluster: listed, but disabled with "already has access". */
  granted: ReadonlySet<string>;
  /** Focus the input on mount (the admin just switched the subject kind). */
  isAutoFocus?: boolean;
}

/** UIG-2 copy when the host groups could not be listed. */
const HOST_LISTING_FAILED = 'Could not list groups on the host cluster. You can still type a group name.';

/** Second line of a group option: whether the host knows it and existing access, joined with " · ". */
function groupFacts(notOnHost: boolean, hasAccess: boolean): string | undefined {
  const facts = [notOnHost ? 'Not found on host cluster' : '', hasAccess ? 'already has access' : ''];
  return facts.filter((fact) => fact !== '').join(' · ') || undefined;
}

/**
 * Group picker of "Grant access" (UIG-2): the host cluster's groups plus groups named in grants (`useGroups`,
 * `system:*` already excluded), existing holders disabled, and the typed text as `Use "<typed>"` for groups that don't
 * exist yet. A failed host listing (`hostStatus` ≠ `ok`) or a failed request never blocks granting: an inline info
 * alert says so and typing still works. OCP's RoleBinding form uses a plain text input here; the list is the fleet
 * addition.
 */
export function GroupTypeahead({ control, granted, isAutoFocus }: GroupTypeaheadProps) {
  const { data, error, isPending } = useGroups();
  const options: TypeaheadOption[] = (data?.items ?? []).map((group) => ({
    value: group.name,
    isDisabled: granted.has(group.name),
    description: groupFacts(group.foundOnHost === false, granted.has(group.name)),
  }));
  const isHostUnlisted = error !== null || (data !== undefined && data.hostStatus !== 'ok');
  return (
    <>
      <TypeaheadSelectField
        control={control}
        label="Subject name"
        placeholder="Search or enter a group name"
        options={options}
        isLoading={isPending}
        allowFreeText
        isAutoFocus={isAutoFocus}
      />
      {isHostUnlisted && <Alert variant="info" isInline isPlain title={HOST_LISTING_FAILED} />}
    </>
  );
}
