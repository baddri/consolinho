import { Form } from '@patternfly/react-core';
import type { Control } from 'react-hook-form';
import { RadioGroupField, TextField } from '@/shared/forms';
import { ACCESS_MODE_OPTIONS, BULK_PRIORITY_HELPER_TEXT } from '../grantText';
import { PriorityField } from '../PriorityField';
import type { BulkGrantFormValues } from './bulkGrant.schema';

/**
 * Step 2 of the bulk grant wizard (GRANT-4): one access mode for every selected cluster, read only by default, and an
 * optional preferred credential name that the review uses to pre-select a credential on clusters with several.
 * Groups also pick one Priority for every selected cluster (GPG-3); which clusters already use it is the Api's
 * per-row answer on submit, not a client pre-check (that would be one grants request per cluster).
 * The `Form` never submits: the wizard footer drives navigation.
 */
export function AccessModeStep({
  control,
  isGroup,
}: {
  control: Control<BulkGrantFormValues>;
  isGroup: boolean;
}) {
  return (
    <Form noValidate onSubmit={(event) => event.preventDefault()}>
      <RadioGroupField control={control} name="accessMode" label="Access mode" isRequired options={ACCESS_MODE_OPTIONS} />
      {isGroup && (
        <PriorityField
          control={control}
          name="priority"
          usedPriorities={[]}
          helperText={BULK_PRIORITY_HELPER_TEXT}
        />
      )}
      <TextField
        control={control}
        name="preferredCredentialName"
        label="Preferred credential name"
        helperText="Optional. On clusters with several credentials, the one with this name is pre-selected, e.g. fleet-view."
        autoComplete="off"
        spellCheck={false}
      />
    </Form>
  );
}
