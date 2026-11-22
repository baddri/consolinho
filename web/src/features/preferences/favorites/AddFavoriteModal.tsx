import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Form, Modal, ModalBody, ModalFooter, ModalHeader } from '@patternfly/react-core';
import { useId, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { TextField } from '@/shared/forms';

/** OCP's allowed favourite name characters: letters, numbers, whitespace and hyphens. */
const NAME_PATTERN = /^[\p{L}\p{N}\s-]*$/u;
/** Characters outside {@link NAME_PATTERN}, replaced by hyphens in the suggested name. */
const INVALID_NAME_CHARS = /[^\p{L}\p{N}\s-]/gu;

/** The suggested name with disallowed characters replaced, like OCP's `sanitizedDefaultName`. */
export function sanitizeFavoriteName(name: string): string {
  return name.replace(INVALID_NAME_CHARS, '-');
}

/** Name rules with OCP's copy (`FavoriteButton.tsx`); `takenNames` are the user's other favourites. */
function favoriteNameSchema(takenNames: readonly string[]) {
  return z.object({
    name: z
      .string()
      .trim()
      .min(1, 'Name is required.')
      .regex(NAME_PATTERN, 'Name can only contain letters, numbers, spaces, and hyphens.')
      .superRefine((name, ctx) => {
        if (takenNames.includes(name)) {
          ctx.addIssue({
            code: 'custom',
            message: `The name ${name} already exists in your favorites. Choose a unique name to save to your favorites.`,
          });
        }
      }),
  });
}

type FavoriteNameValues = z.input<ReturnType<typeof favoriteNameSchema>>;

/** Props for {@link AddFavoriteModal}. */
export interface AddFavoriteModalProps {
  /** Prefilled name. */
  defaultName: string;
  /** Names already used by the user's favourites (must be unique). */
  takenNames: readonly string[];
  onSave: (name: string) => void;
  onClose: () => void;
}

/**
 * OCP's "Add to favorites" dialog (`FavoriteButton.tsx`): a small modal with a required "Name" field (prefilled,
 * letters/numbers/spaces/hyphens, unique among the user's favourites), Save and Cancel. Mounted only while open.
 */
export function AddFavoriteModal({ defaultName, takenNames, onSave, onClose }: AddFavoriteModalProps) {
  const titleId = useId();
  const formId = useId();
  const schema = useMemo(() => favoriteNameSchema(takenNames), [takenNames]);
  const form = useForm<FavoriteNameValues, unknown, z.output<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { name: defaultName },
    mode: 'onChange',
  });
  const submit = form.handleSubmit(({ name }) => onSave(name));

  return (
    <Modal variant="small" isOpen onClose={onClose} aria-labelledby={titleId}>
      <ModalHeader title="Add to favorites" labelId={titleId} />
      <ModalBody>
        <Form id={formId} noValidate onSubmit={(event) => void submit(event)}>
          <TextField control={form.control} name="name" label="Name" isRequired autoComplete="off" />
        </Form>
      </ModalBody>
      <ModalFooter>
        <Button type="submit" form={formId}>
          Save
        </Button>
        <Button variant="link" onClick={onClose}>
          Cancel
        </Button>
      </ModalFooter>
    </Modal>
  );
}
