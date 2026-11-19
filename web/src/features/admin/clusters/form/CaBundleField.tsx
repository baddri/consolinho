import { FileUpload, FormGroup } from '@patternfly/react-core';
import { useState } from 'react';
import { useController, type Control } from 'react-hook-form';
// The shared adapters' a11y helpers; not part of the `shared/forms` barrel, which only exposes finished adapters.
import { fieldA11y, FieldHelperText, useWrapperFocusRef } from '@/shared/forms/fieldA11y';
import type { ClusterFormInput, ClusterFormValues } from './clusterForm.schema';

/** Props for {@link CaBundleField}. */
export interface CaBundleFieldProps {
  control: Control<ClusterFormInput, unknown, ClusterFormValues>;
  isDisabled?: boolean;
}

const HELPER_TEXT = 'Leave empty to use the system trust store.';

/**
 * The cluster's CA bundle (CLU-2): a PatternFly `FileUpload type="text"` so the admin can browse for a PEM file or
 * paste it, and edit an uploaded file's text. "Clear" empties it (= system trust). Errors — the client's skip-TLS rule
 * lives on `skipTlsVerify`, the server's PEM/size checks land here — show like every other field's; RHF focuses the
 * text area through the wrapper (the `FileUpload` forwards no ref).
 */
export function CaBundleField({ control, isDisabled = false }: CaBundleFieldProps) {
  const { field, fieldState } = useController({ control, name: 'caBundle' });
  const a11y = fieldA11y('caBundle', fieldState.error, HELPER_TEXT);
  const focusRef = useWrapperFocusRef(field.ref);
  const [filename, setFilename] = useState('');
  const [isReading, setIsReading] = useState(false);

  return (
    <FormGroup label="CA bundle" fieldId={a11y.fieldId}>
      <div ref={focusRef}>
        <FileUpload
          id={a11y.fieldId}
          type="text"
          value={field.value}
          filename={filename}
          filenamePlaceholder="Drag and drop a PEM file or upload one"
          filenameAriaLabel="CA bundle file name"
          browseButtonText="Upload"
          textAreaPlaceholder="-----BEGIN CERTIFICATE-----"
          allowEditingUploadedText
          isDisabled={isDisabled}
          aria-label="CA bundle"
          isLoading={isReading}
          validated={a11y.isInvalid ? 'error' : 'default'}
          onFileInputChange={(_event, file) => setFilename(file.name)}
          onReadStarted={() => setIsReading(true)}
          onReadFinished={() => setIsReading(false)}
          onReadFailed={() => setIsReading(false)}
          onDataChange={(_event, data) => field.onChange(data)}
          onTextChange={(_event, text) => field.onChange(text)}
          onClearClick={() => {
            setFilename('');
            field.onChange('');
          }}
          onTextAreaBlur={field.onBlur}
          browseButtonAriaDescribedby={a11y.describedBy}
        />
      </div>
      <FieldHelperText id={a11y.helperId} error={fieldState.error} helperText={HELPER_TEXT} />
    </FormGroup>
  );
}
