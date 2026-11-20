import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Form, Modal, ModalBody, ModalFooter, ModalHeader } from '@patternfly/react-core';
import { useId } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';
import {
  CheckboxField,
  FormProblemAlert,
  RadioGroupField,
  TextField,
  useFormProblem,
  type RadioGroupFieldOption,
} from '@/shared/forms';
import { useToast } from '@/shared/ui';
import { useCreateUser } from './api';
import { CREATE_USER_DEFAULTS, createUserSchema, type CreateUserFormValues } from './CreateUserForm.schema';
import type { OpenBulkGrantState } from './UserDetailPage';
import { userDetailPath } from './UserRow';

const ROLE_CHOICES: readonly RadioGroupFieldOption[] = [
  { value: 'user', label: 'User', description: 'Uses the clusters they are granted access to.' },
  {
    value: 'admin',
    label: 'Admin',
    description: 'Also manages users, clusters, credentials and grants in Fleet administration.',
  },
];

/** Props for {@link CreateUserModal}. */
export interface CreateUserModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * "Add user" dialog (USR-2): pre-creates a user before their first login with role and read-only flag. Client rules
 * come from `createUserSchema`; server 400s land on their fields and 409 `Users.UsernameTaken` on the username. On
 * success it toasts "User <name> created" and opens the new user's detail page; "Create and grant access" opens its
 * Cluster access tab with the bulk grant wizard instead (USR-2, GRANT-4). The form mounts only while open, so every
 * opening starts empty.
 */
export function CreateUserModal({ isOpen, onClose }: CreateUserModalProps) {
  const titleId = useId();
  return (
    <Modal variant="small" isOpen={isOpen} onClose={onClose} aria-labelledby={titleId}>
      {isOpen && <CreateUserForm titleId={titleId} onClose={onClose} />}
    </Modal>
  );
}

/** Header, form and footer of {@link CreateUserModal}; owns the form state. */
function CreateUserForm({ titleId, onClose }: { titleId: string; onClose: () => void }) {
  const formId = useId();
  const navigate = useNavigate();
  const toast = useToast();
  const createUser = useCreateUser();
  const form = useForm<CreateUserFormValues>({
    resolver: zodResolver(createUserSchema),
    defaultValues: CREATE_USER_DEFAULTS,
  });
  const { problem, handleSubmit } = useFormProblem(form, { codeToField: { 'Users.UsernameTaken': 'username' } });
  /** Creates the user, then opens their page — the Cluster access tab with the bulk grant wizard when `grantAccess`. */
  const submitThen = (grantAccess: boolean) =>
    handleSubmit(async (values) => {
      const user = await createUser.mutateAsync(values);
      toast.success(`User ${user.username} created`);
      onClose();
      if (grantAccess) {
        const state: OpenBulkGrantState = { openBulkGrant: true };
        await navigate(`${userDetailPath(user.username)}/access`, { state });
      } else {
        await navigate(userDetailPath(user.username));
      }
    });
  const submit = submitThen(false);
  const submitAndGrant = submitThen(true);

  return (
    <>
      <ModalHeader title="Add user" labelId={titleId} />
      <ModalBody>
        <Form id={formId} noValidate onSubmit={(event) => void submit(event)}>
          <FormProblemAlert problem={problem} />
          <TextField
            control={form.control}
            name="username"
            label="Username"
            isRequired
            helperText="Exact OpenShift username, case-sensitive."
            autoComplete="off"
            spellCheck={false}
          />
          <RadioGroupField control={form.control} name="role" label="Role" options={ROLE_CHOICES} />
          <CheckboxField
            control={form.control}
            name="isReadOnly"
            label="Read only"
            helperText="Read-only users can't change anything on any cluster or in Fleet administration."
          />
        </Form>
      </ModalBody>
      <ModalFooter>
        <Button
          type="submit"
          form={formId}
          isAriaDisabled={form.formState.isSubmitting}
          isLoading={form.formState.isSubmitting}
        >
          Create
        </Button>
        <Button
          variant="secondary"
          isAriaDisabled={form.formState.isSubmitting}
          onClick={() => void submitAndGrant()}
        >
          Create and grant access
        </Button>
        <Button variant="link" onClick={onClose}>
          Cancel
        </Button>
      </ModalFooter>
    </>
  );
}
