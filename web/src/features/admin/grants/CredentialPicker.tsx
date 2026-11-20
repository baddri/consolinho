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
  if (lastTest === null) return <Label isCompact color="grey">Never tested</Label>;
  if (!lastTest.succeeded) return <Label isCompact status="danger">Last test failed</Label>;
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
        <CredentialSelect
          clusterName={clusterName}
          fieldId={fieldId}
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
interface CredentialSelectProps {
  clusterName: string;
  fieldId: string;
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  toggleRef: RefObject<HTMLButtonElement | null>;
  isInvalid: boolean;
  describedBy: string | undefined;
}

/** The select itself; mounted only with a cluster, so its credentials query never runs for `''`. */
function CredentialSelect({
  clusterName,
  fieldId,
  value,
  onChange,
  onBlur,
  toggleRef,
  isInvalid,
  describedBy,
}: CredentialSelectProps) {
  const { data: credentials, error, isPending } = useClusterCredentials(clusterName);
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
  else if (error) toggleText = 'Could not load credentials';
  else if (credentials.length === 0) toggleText = 'No credentials on this cluster';

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
            id={fieldId}
            ref={toggleRef}
            isFullWidth
            isExpanded={isOpen}
            isDisabled={!credentials || credentials.length === 0}
            status={isInvalid ? 'danger' : undefined}
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
