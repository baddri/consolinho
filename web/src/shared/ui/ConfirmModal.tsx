import {
  Button,
  Form,
  FormGroup,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Stack,
  StackItem,
  TextInput,
} from '@patternfly/react-core';
import { useId, useState, type ReactNode, type SyntheticEvent } from 'react';
import { ErrorState } from './ErrorState';

/** Props for {@link ConfirmModal}. */
export interface ConfirmModalProps {
  isOpen: boolean;
  /**
   * Names the action; deletes use OCP's "Delete <kind>?" and name the object and cluster in bold in the body
   * (`UX.md` §9), other confirms may name them in the title, e.g. "Disable prod-eu-1".
   */
  title: string;
  /** Shown inline after the title text and part of the accessible name, normally `<EnvironmentLabel isCompact />`. */
  titleLabel?: ReactNode;
  /** Icon before the title; defaults to `'warning'` for `variant="danger"` (OCP delete modal), none otherwise. */
  titleIconVariant?: 'warning' | 'danger';
  /** Explains the consequences. */
  children: ReactNode;
  /** Verb of the confirm button, e.g. "Disable". */
  confirmLabel: string;
  /** `danger` for destructive actions and production-scoped access changes (default `primary`). */
  variant?: 'primary' | 'danger';
  /** When set, the user must type exactly this text (e.g. the cluster name, CLU-6) before confirming. */
  typeToConfirm?: string;
  /** The mutation is running: the confirm button shows a spinner and cannot be clicked again. */
  isPending?: boolean;
  /** The failed mutation's error, shown inline in the dialog (ADR-0015 §6); `null`/`undefined` = none. */
  error?: unknown;
  onConfirm: () => void;
  onClose: () => void;
}

/**
 * Confirmation dialog for destructive or access-changing actions (ADR-0015 §7): a small PatternFly modal whose
 * title names object and cluster, with optional environment label, type-to-confirm gating, pending spinner and an
 * inline error slot. Closing it is the caller's job (`onClose`), typically after the mutation succeeds.
 */
export function ConfirmModal({
  isOpen,
  title,
  titleLabel,
  titleIconVariant,
  children,
  confirmLabel,
  variant = 'primary',
  typeToConfirm,
  isPending = false,
  error,
  onConfirm,
  onClose,
}: ConfirmModalProps) {
  const titleId = useId();
  const labelId = useId();
  const bodyId = useId();
  return (
    <Modal
      variant="small"
      isOpen={isOpen}
      onClose={onClose}
      // The label is part of the name so screen readers hear "prod" too: it is the production safety signal. The ids
      // sit on the title's text spans, not the h1, so the icon's "Warning alert:" text stays out of the name.
      aria-labelledby={titleLabel === undefined ? titleId : `${titleId} ${labelId}`}
      aria-describedby={bodyId}
    >
      {/* Mounted only while open, so the typed confirmation text resets each time the dialog opens. */}
      {isOpen && (
        <ConfirmModalContent
          titleId={titleId}
          labelId={labelId}
          bodyId={bodyId}
          title={title}
          titleLabel={titleLabel}
          titleIconVariant={titleIconVariant ?? (variant === 'danger' ? 'warning' : undefined)}
          confirmLabel={confirmLabel}
          variant={variant}
          typeToConfirm={typeToConfirm}
          isPending={isPending}
          error={error}
          onConfirm={onConfirm}
          onClose={onClose}
        >
          {children}
        </ConfirmModalContent>
      )}
    </Modal>
  );
}

type ConfirmModalContentProps = Omit<ConfirmModalProps, 'isOpen'> & {
  titleId: string;
  labelId: string;
  bodyId: string;
  variant: 'primary' | 'danger';
  isPending: boolean;
};

/** Header, body and footer of {@link ConfirmModal}; owns the type-to-confirm input state. */
function ConfirmModalContent({
  titleId,
  labelId,
  bodyId,
  title,
  titleLabel,
  titleIconVariant,
  children,
  confirmLabel,
  variant,
  typeToConfirm,
  isPending,
  error,
  onConfirm,
  onClose,
}: ConfirmModalContentProps) {
  const formId = useId();
  const inputId = useId();
  const [typed, setTyped] = useState('');
  const isConfirmTextTyped = typeToConfirm === undefined || typed === typeToConfirm;
  const canConfirm = !isPending && isConfirmTextTyped;
  const confirm = () => {
    if (canConfirm) {
      onConfirm();
    }
  };

  // The type-to-confirm input sits in a form so Enter confirms, like clicking the button.
  const onSubmit = (event: SyntheticEvent) => {
    event.preventDefault();
    confirm();
  };

  return (
    <>
      <ModalHeader
        titleIconVariant={titleIconVariant}
        title={<InlineLabelTitle title={title} titleId={titleId} label={titleLabel} labelId={labelId} />}
      />
      <ModalBody>
        <Stack hasGutter>
          <StackItem id={bodyId}>{children}</StackItem>
          {typeToConfirm !== undefined && (
            <StackItem>
              <Form id={formId} onSubmit={onSubmit}>
                <FormGroup label={`Type "${typeToConfirm}" to confirm`} fieldId={inputId}>
                  <TextInput
                    id={inputId}
                    value={typed}
                    onChange={(_event, value) => setTyped(value)}
                    autoComplete="off"
                    spellCheck={false}
                  />
                </FormGroup>
              </Form>
            </StackItem>
          )}
          {error !== undefined && error !== null && (
            <StackItem>
              <ErrorState error={error} title={`${confirmLabel} failed`} isLiveRegion />
            </StackItem>
          )}
        </Stack>
      </ModalBody>
      <ModalFooter>
        <Button
          variant={variant}
          onClick={confirm}
          // Untyped confirmation text: truly disabled. Pending: aria-disabled, so focus stays on the button.
          isDisabled={!isConfirmTextTyped}
          isAriaDisabled={isPending}
          isLoading={isPending}
          spinnerAriaValueText={isPending ? 'Working' : undefined}
        >
          {confirmLabel}
        </Button>
        <Button variant="link" onClick={onClose}>
          Cancel
        </Button>
      </ModalFooter>
    </>
  );
}

/** Props for {@link InlineLabelTitle}. */
export interface InlineLabelTitleProps {
  title: string;
  /** Id of the title text, for the modal's `aria-labelledby`. */
  titleId: string;
  /** Context label (environment) after the title text; omitted when `undefined`. */
  label?: ReactNode;
  /** Id of the label wrapper, for the modal's `aria-labelledby`. */
  labelId: string;
}

/**
 * Modal title with its context label inline after the text (`UX.md` §9: never in the header's `help` slot). Pass it
 * as `ModalHeader title` and point the `Modal`'s `aria-labelledby` at `titleId` (+ `labelId`), so the label is
 * announced with the title.
 */
export function InlineLabelTitle({ title, titleId, label, labelId }: InlineLabelTitleProps) {
  return (
    <>
      <span id={titleId}>{title}</span>
      {label !== undefined && (
        <>
          {' '}
          <span id={labelId}>{label}</span>
        </>
      )}
    </>
  );
}
