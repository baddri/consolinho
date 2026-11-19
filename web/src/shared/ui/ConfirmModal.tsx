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
  /** Names the object **and** the cluster, e.g. "Disable cluster prod-eu-1?" (spec §5). */
  title: string;
  /** Shown next to the title, normally `<EnvironmentLabel environment={…} />`. */
  titleLabel?: ReactNode;
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
      // The label is part of the name so screen readers hear "prod" too: it is the production safety signal.
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
      {/*
        The label goes in PF's `help` slot, not inside the title: the title is single-line with clipped overflow, so a
        long cluster name could hide a label placed after it. The help slot sits beside the title, never shrinks, and
        leaves the title a plain string, so PF truncates it with an ellipsis and shows the full title in a tooltip.
      */}
      <ModalHeader
        title={title}
        labelId={titleId}
        help={titleLabel !== undefined ? <span id={labelId}>{titleLabel}</span> : undefined}
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
