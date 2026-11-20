import { Form } from '@patternfly/react-core';
import type { Control } from 'react-hook-form';
import { RadioGroupField, TextField } from '@/shared/forms';
import { ACCESS_MODE_OPTIONS } from '../grantText';
import type { BulkGrantFormValues } from './bulkGrant.schema';

/**
 * Step 2 of the bulk grant wizard (GRANT-4): one access mode for every selected cluster, read only by default, and an
 * optional preferred credential name that the review uses to pre-select a credential on clusters with several.
 * The `Form` never submits: the wizard footer drives navigation.
 */
export function AccessModeStep({ control }: { control: Control<BulkGrantFormValues> }) {
  return (
    <Form noValidate onSubmit={(event) => event.preventDefault()}>
      <RadioGroupField control={control} name="accessMode" label="Access mode" isRequired options={ACCESS_MODE_OPTIONS} />
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
