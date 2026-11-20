import type { Control } from 'react-hook-form';
import { FileUploadField } from '@/shared/forms';
import { MAX_CA_BUNDLE_BYTES, type ClusterFormInput, type ClusterFormValues } from './clusterForm.schema';

/** Props for {@link CaBundleField}. */
export interface CaBundleFieldProps {
  control: Control<ClusterFormInput, unknown, ClusterFormValues>;
  isDisabled?: boolean;
}

/**
 * The cluster's CA bundle (CLU-2): browse for / drop a PEM file or paste it, and edit an uploaded file's text. "Clear"
 * empties it (= system trust). Errors — the client's size check, the server's PEM checks — land on this field; the
 * skip-TLS conflict lives on `skipTlsVerify`. Files over the server's 256 KiB limit are rejected before reading.
 */
export function CaBundleField({ control, isDisabled = false }: CaBundleFieldProps) {
  return (
    <FileUploadField
      control={control}
      name="caBundle"
      label="CA bundle"
      helperText="Leave empty to use the system trust store."
      maxSizeBytes={MAX_CA_BUNDLE_BYTES}
      isMonospace
      isDisabled={isDisabled}
      placeholder="-----BEGIN CERTIFICATE-----"
      filenamePlaceholder="Drag and drop a PEM file or upload one"
    />
  );
}
