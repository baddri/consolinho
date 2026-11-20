import { FileUpload, FormGroup, TextArea, type FileUploadProps } from '@patternfly/react-core';
import { useState } from 'react';
import { useController, type FieldError, type FieldPathByValue, type FieldValues } from 'react-hook-form';
import { fieldA11y, FieldHelperText } from './fieldA11y';
import type { FieldBaseProps } from './types';

/** Accepted file types in react-dropzone's format (`{ 'application/x-pem-file': ['.pem', '.crt'] }`). */
export type FileUploadAccept = NonNullable<FileUploadProps['dropzoneProps']>['accept'];

/** Props for {@link FileUploadField}: the common field props plus the upload options. */
export type FileUploadFieldProps<
  T extends FieldValues,
  N extends FieldPathByValue<T, string | null | undefined>,
  TTransformed = T,
> = FieldBaseProps<T, N, TTransformed> & {
  /** File types the browse dialog and drop zone accept; other files are rejected with a field error. */
  accept?: FileUploadAccept;
  /** Largest file accepted, in bytes; larger files are rejected with a field error. Pasted text is the schema's job. */
  maxSizeBytes?: number;
  /** Renders the text in a monospace font (PEM, tokens, YAML). */
  isMonospace?: boolean;
  isDisabled?: boolean;
  /** Lets the admin edit text that came from a file (default `true`); otherwise it is read-only until cleared. */
  allowEditingUploadedText?: boolean;
  /** Text-area placeholder. */
  placeholder?: string;
  /** Placeholder of the read-only file-name input. */
  filenamePlaceholder?: string;
  /** Label of the browse button (default "Upload"). */
  browseButtonText?: string;
  rows?: number;
};

/** "256 KiB"-style size for rejection messages. */
function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${+(bytes / (1024 * 1024)).toFixed(1)} MiB`;
  if (bytes >= 1024) return `${+(bytes / 1024).toFixed(1)} KiB`;
  return `${bytes} bytes`;
}

/** Turns a local file problem into the `FieldError` shape {@link FieldHelperText} renders. */
function fileFieldError(message: string): FieldError {
  return { type: 'file', message };
}

/**
 * Text bound to react-hook-form that can be typed/pasted or loaded from a file (CA bundles, SA tokens). Built on
 * PatternFly `FileUpload` with `hideDefaultPreview` and our own `TextArea`, because the built-in preview forwards
 * neither a ref nor `aria-describedby`: this way the text area carries the field id, is linked to the helper/error
 * text, flags `aria-invalid` and is focused by RHF on errors like every other adapter.
 *
 * File problems (read failure, wrong type, too large) are local to the upload, so they live in component state and
 * show as the field error until the next edit, upload or clear; they never change the value.
 */
export function FileUploadField<
  T extends FieldValues,
  N extends FieldPathByValue<T, string | null | undefined>,
  TTransformed = T,
>({
  control,
  name,
  label,
  isRequired = false,
  helperText,
  accept,
  maxSizeBytes,
  isMonospace = false,
  isDisabled,
  allowEditingUploadedText = true,
  placeholder,
  filenamePlaceholder = 'Drag and drop a file or upload one',
  browseButtonText = 'Upload',
  rows,
}: FileUploadFieldProps<T, N, TTransformed>) {
  // Destructured so the React compiler lint sees `ref` as the only ref (see TextAreaField).
  const {
    field: { ref, value, onChange, onBlur, name: fieldName, disabled },
    fieldState,
  } = useController({ control, name });
  const [filename, setFilename] = useState('');
  const [isReading, setIsReading] = useState(false);
  const [fileError, setFileError] = useState<string>();

  // The newest problem wins: a file error is cleared by any later change, so while it exists it is the latest.
  const error = fileError !== undefined ? fileFieldError(fileError) : fieldState.error;
  const a11y = fieldA11y(name, error, helperText);
  const text = typeof value === 'string' ? value : '';
  const disabledNow = isDisabled ?? disabled ?? false;

  const changeText = (next: string) => {
    setFileError(undefined);
    onChange(next);
  };

  return (
    <FormGroup label={label} isRequired={isRequired} fieldId={a11y.fieldId}>
      <FileUpload
        id={`${a11y.fieldId}-upload`}
        type="text"
        hideDefaultPreview
        value={text}
        filename={filename}
        filenamePlaceholder={filenamePlaceholder}
        filenameAriaLabel={`${label} file name`}
        browseButtonText={browseButtonText}
        browseButtonAriaDescribedby={a11y.describedBy}
        isDisabled={disabledNow}
        isLoading={isReading}
        spinnerAriaValueText={`Reading ${label} file`}
        validated={a11y.isInvalid ? 'error' : 'default'}
        dropzoneProps={{
          accept,
          maxSize: maxSizeBytes,
          onDropRejected: (rejections) => {
            const rejection = rejections[0];
            if (rejection === undefined) return;
            const tooLarge = rejection.errors.some((e) => e.code === 'file-too-large');
            setFileError(
              tooLarge && maxSizeBytes !== undefined
                ? `${rejection.file.name} is larger than ${formatSize(maxSizeBytes)}.`
                : `${rejection.file.name} can't be used here: ${rejection.errors[0]?.message ?? 'rejected'}.`,
            );
          },
        }}
        // Not `onFileInputChange`: PatternFly also fires it for files the drop zone rejected (size/type).
        onReadStarted={(_event, file) => {
          setFileError(undefined);
          setFilename(file.name);
          setIsReading(true);
        }}
        onReadFinished={() => setIsReading(false)}
        onReadFailed={(_event, _error, file) => {
          setFilename('');
          setFileError(`Couldn't read ${file.name}. Try again or paste the content.`);
        }}
        // After a failed read PatternFly reports '' here; the read error must survive that, so no `changeText`.
        onDataChange={(_event, data) => onChange(data)}
        onClearClick={() => {
          setFilename('');
          changeText('');
        }}
      >
        <TextArea
          ref={ref}
          id={a11y.fieldId}
          name={fieldName}
          // PEM, tokens and YAML: spellcheck is useless and enhanced spellcheck may send the text off-device.
          spellCheck={false}
          value={text}
          onChange={(_event, next) => changeText(next)}
          onBlur={onBlur}
          placeholder={placeholder}
          rows={rows}
          resizeOrientation="vertical"
          readOnlyVariant={filename !== '' && !allowEditingUploadedText ? 'default' : undefined}
          isDisabled={disabledNow}
          className={isMonospace ? 'pf-v6-u-font-family-monospace' : undefined}
          validated={a11y.isInvalid ? 'error' : 'default'}
          aria-invalid={a11y.isInvalid}
          aria-required={isRequired || undefined}
          aria-describedby={a11y.describedBy}
        />
      </FileUpload>
      <FieldHelperText id={a11y.helperId} error={error} helperText={helperText} />
    </FormGroup>
  );
}
