import {
  Flex,
  FlexItem,
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
  Label,
  MenuToggle,
  Select,
  SelectList,
  SelectOption,
} from '@patternfly/react-core';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { useController, type Control } from 'react-hook-form';
import type { Credential } from '@/shared/api';
import { fieldIdFor } from '@/shared/forms';
import { useClusterCredentials } from '../credentials/api';
import { CredentialExpiryLabel } from '../credentials/CredentialExpiryLabel';
import type { GrantFormValues } from './grantForm.schema';

/** Props for {@link CredentialPicker}. */
export interface CredentialPickerProps {
  control: Control<GrantFormValues>;
  /** The grant's cluster; `''` while none is chosen (the picker is disabled then). */
  clusterName: string;
}

/** Q7 test hint of a credential: "Never tested" / "Last test failed", nothing after a passed test. */
function TestHint({ lastTest }: Pick<Credential, 'lastTest'>) {
  if (lastTest === null)
    return (
      <Label isCompact color="grey">
        Never tested
      </Label>
    );
  if (!lastTest.succeeded)
    return (
      <Label isCompact status="danger">
        Last test failed
      </Label>
    );
  return null;
}

/** Second line of a credential option: expiry label and test hint. */
function CredentialFacts({ credential }: { credential: Credential }) {
  return (
    <Flex spaceItems={{ default: 'spaceItemsSm' }} alignItems={{ default: 'alignItemsCenter' }}>
      <FlexItem>
        <CredentialExpiryLabel expiryStatus={credential.expiryStatus} expiresAt={credential.expiresAt} />
      </FlexItem>
      <FlexItem>
        <TestHint lastTest={credential.lastTest} />
      </FlexItem>
    </Flex>
  );
}

/** {@link CredentialSelect} fed by one cluster's credentials; mounted only with a cluster, so the query never runs for `''`. */
function ClusterCredentialSelect(
  props: Omit<CredentialSelectProps, 'credentials' | 'isPending' | 'isLoadError'>,
) {
  const { data, error, isPending } = useClusterCredentials(props.clusterName);
  return (
    <CredentialSelect {...props} credentials={data} isPending={isPending} isLoadError={error !== null} />
  );
}

/**
 * Credential of a grant (GRANT-2, Q7): a single select of the chosen cluster's credentials, each option with its
 * expiry label and "Never tested" / "Last test failed" — information only, no credential is blocked. With exactly one
 * credential it is pre-selected. Disabled until a cluster is chosen; the credentials load only then. 400 errors on
 * `credentialId` (e.g. a credential of another cluster) show under the field, which RHF focuses through the toggle ref.
 */
export function CredentialPicker({ control, clusterName }: CredentialPickerProps) {
  const { field, fieldState } = useController({ control, name: 'credentialId' });
  const fieldId = fieldIdFor(field.name);
  const helperId = `${fieldId}-helper`;
  const error = fieldState.error;
  const toggleRef = useRef<HTMLButtonElement>(null);

  const { ref: registerRef } = field;
  useEffect(() => {
    registerRef({ focus: () => toggleRef.current?.focus() });
  }, [registerRef]);

  return (
    <FormGroup label="Credential" isRequired fieldId={fieldId}>
      {clusterName === '' ? (
        <MenuToggle id={fieldId} ref={toggleRef} isFullWidth isDisabled>
          Select a cluster first
        </MenuToggle>
      ) : (
        <ClusterCredentialSelect
          clusterName={clusterName}
          toggleId={fieldId}
          value={field.value}
          onChange={field.onChange}
          onBlur={field.onBlur}
          toggleRef={toggleRef}
          isInvalid={error !== undefined}
          describedBy={error ? helperId : undefined}
        />
      )}
      {error && (
        <FormHelperText>
          <HelperText>
            <HelperTextItem id={helperId} variant="error">
              {error.message}
            </HelperTextItem>
          </HelperText>
        </FormHelperText>
      )}
    </FormGroup>
  );
}

/** Props of {@link CredentialSelect}. */
export interface CredentialSelectProps {
  /** Cluster whose credentials are offered; names the option list. */
  clusterName: string;
  /** The credentials of `clusterName`; `undefined` while loading. */
  credentials: readonly Credential[] | undefined;
  isPending: boolean;
  /** The credentials failed to load. */
  isLoadError: boolean;
  /** `id` of the toggle (label `for`). */
  toggleId?: string;
  /** Accessible name of the toggle when no `<label>` points at it, e.g. a table row ("Credential for dev-1"). */
  ariaLabel?: string;
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  toggleRef: RefObject<HTMLButtonElement | null>;
  isInvalid: boolean;
  describedBy: string | undefined;
}

/**
 * Credential single select of one cluster (Q7): each option shows its expiry label and test hint; with exactly one
 * credential it is pre-selected. Takes the credentials as data, so the grant dialog (one cluster's query) and the
 * bulk grant review (one fleet-wide query, filtered per row) share it.
 */
export function CredentialSelect({
  clusterName,
  credentials,
  isPending,
  isLoadError,
  toggleId,
  ariaLabel,
  value,
  onChange,
  onBlur,
  toggleRef,
  isInvalid,
  describedBy,
}: CredentialSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const selected = credentials?.find((credential) => credential.id === value);

  // Exactly one credential: nothing to choose, so pre-select it (GRANT-2).
  const only = credentials?.length === 1 ? credentials[0] : undefined;
  useEffect(() => {
    if (only !== undefined && value === '') onChange(only.id);
  }, [only, value, onChange]);

  let toggleText = 'Select a credential';
  if (selected) toggleText = selected.name;
  else if (isPending) toggleText = 'Loading credentials…';
  else if (isLoadError) toggleText = 'Could not load credentials';
  else if (credentials?.length === 0) toggleText = 'No credentials on this cluster';

  return (
    <Select
      isOpen={isOpen}
      selected={value}
      onSelect={(_event, next) => {
        if (typeof next === 'string') onChange(next);
        setIsOpen(false);
      }}
      onOpenChange={(open) => {
        setIsOpen(open);
        if (!open) onBlur();
      }}
      toggle={{
        toggleRef,
        toggleNode: (
          <MenuToggle
            id={toggleId}
            ref={toggleRef}
            isFullWidth
            isExpanded={isOpen}
            isDisabled={!credentials || credentials.length === 0}
            status={isInvalid ? 'danger' : undefined}
            aria-label={ariaLabel}
            aria-invalid={isInvalid}
            aria-describedby={describedBy}
            onClick={() => setIsOpen((open) => !open)}
          >
            {toggleText}
          </MenuToggle>
        ),
      }}
    >
      <SelectList aria-label={`Credentials of ${clusterName}`}>
        {credentials?.map((credential) => (
          <SelectOption
            key={credential.id}
            value={credential.id}
            isSelected={credential.id === value}
            description={<CredentialFacts credential={credential} />}
          >
            {credential.name}
          </SelectOption>
        ))}
      </SelectList>
    </Select>
  );
}
