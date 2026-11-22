import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Form } from '@patternfly/react-core';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm, type UseFormReturn } from 'react-hook-form';
import { z } from 'zod';
import { ApiError } from '@/shared/api';
import {
  applyServerErrors,
  CheckboxField,
  ChipInputField,
  ConflictAlert,
  dnsLabel,
  FormProblemAlert,
  RadioGroupField,
  SelectField,
  SwitchField,
  TextAreaField,
  TextField,
  toFormPath,
  useFormProblem,
} from '.';

const schema = z.object({
  name: dnsLabel(40),
  token: z.string(),
  description: z.string(),
  accessMode: z.enum(['readOnly', 'readWrite']),
  isEnabled: z.boolean(),
  skipTls: z.boolean(),
  items: z.array(z.object({ username: z.string(), credentialId: z.string() })),
  version: z.number(),
});
type DemoValues = z.infer<typeof schema>;

const DEFAULTS: DemoValues = {
  name: '',
  token: '',
  description: '',
  accessMode: 'readOnly',
  isEnabled: true,
  skipTls: false,
  items: [
    { username: 'alice', credentialId: '' },
    { username: 'bob', credentialId: '' },
  ],
  version: 7,
};

const CREDENTIALS = [
  { value: 'cred-view', label: 'fleet-view' },
  { value: 'cred-admin', label: 'fleet-admin' },
];

/**
 * What a real CP1 form looks like: zod resolver, adapters, `applyServerErrors` in the submit handler, both alerts.
 * `submit` stands in for the mutation and rejects with an `ApiError` like the API hooks do.
 */
function DemoForm({ submit, onReload }: { submit: (values: DemoValues) => Promise<void>; onReload?: () => void }) {
  const form = useForm<DemoValues>({ resolver: zodResolver(schema), defaultValues: DEFAULTS });
  // Inline options literal on purpose: the hook reads them at submit time.
  const { problem, handleSubmit, clearProblem } = useFormProblem(form, {
    codeToField: { 'Clusters.NameTaken': 'name' },
  });
  const { control } = form;

  return (
    <Form noValidate onSubmit={(event) => void handleSubmit(submit)(event)}>
      <ConflictAlert
        problem={problem}
        onReload={() => {
          onReload?.();
          clearProblem();
        }}
      />
      <FormProblemAlert problem={problem} />
      <TextField control={control} name="name" label="Name" isRequired helperText="Lowercase DNS label." />
      <TextField control={control} name="token" label="Token" type="password" />
      <TextAreaField control={control} name="description" label="Description" />
      <RadioGroupField
        control={control}
        name="accessMode"
        label="Access mode"
        options={[
          { value: 'readOnly', label: 'Read-only', description: 'View resources only.' },
          // ReactNode labels allow e.g. an EnvironmentLabel next to the text.
          { value: 'readWrite', label: <span>Read-write</span> },
        ]}
      />
      <SwitchField control={control} name="isEnabled" label="Enabled" />
      <CheckboxField control={control} name="skipTls" label="Skip TLS verification" />
      {DEFAULTS.items.map((item, index) => (
        <SelectField
          key={item.username}
          control={control}
          name={`items.${index}.credentialId`}
          label={`Credential for ${item.username}`}
          placeholder="Select a credential"
          options={CREDENTIALS}
        />
      ))}
      <Button type="submit">Save</Button>
    </Form>
  );
}

function renderDemo(submit: (values: DemoValues) => Promise<void> = () => Promise.resolve(), onReload?: () => void) {
  const user = userEvent.setup();
  render(<DemoForm submit={submit} onReload={onReload} />);
  return { user };
}

const rejectWith = (init: ConstructorParameters<typeof ApiError>[0]) => () => Promise.reject(new ApiError(init));

describe('field adapters', () => {
  it('labels every control and links helper text', () => {
    renderDemo();

    // The required asterisk is aria-hidden: part of the label text, not of the accessible name.
    expect(screen.getByLabelText(/^Name/)).toBe(screen.getByRole('textbox', { name: 'Name' }));
    expect(screen.getByLabelText(/^Name/)).toHaveAccessibleDescription('Lowercase DNS label.');
    expect(screen.getByLabelText('Token')).toBeInTheDocument();
    expect(screen.getByLabelText('Description')).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'Access mode' })).toBeInTheDocument();
    expect(screen.getByLabelText('Read-only')).toBeChecked();
    expect(screen.getByLabelText('Enabled')).toBeChecked();
    expect(screen.getByLabelText('Skip TLS verification')).not.toBeChecked();
    expect(screen.getByLabelText('Credential for bob')).toHaveValue('');
  });

  it('shows a client zod error inline, marked invalid and linked to the control', async () => {
    const submit = vi.fn(() => Promise.resolve());
    const { user } = renderDemo(submit);

    await user.type(screen.getByLabelText(/^Name/), 'Prod_EU');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    const name = screen.getByLabelText(/^Name/);
    expect(name).toHaveAttribute('aria-invalid', 'true');
    expect(name).toHaveAccessibleDescription(/Use lowercase letters, digits and '-' \(max 40\)/);
    expect(submit).not.toHaveBeenCalled();
  });

  it('binds every control to the submitted values', async () => {
    const submit = vi.fn<(values: DemoValues) => Promise<void>>(() => Promise.resolve());
    const { user } = renderDemo(submit);

    await user.type(screen.getByLabelText(/^Name/), 'prod-eu-1');
    await user.type(screen.getByLabelText('Token'), 'fake-token');
    await user.type(screen.getByLabelText('Description'), 'Main');
    await user.click(screen.getByLabelText('Read-write'));
    await user.click(screen.getByLabelText('Enabled'));
    await user.click(screen.getByLabelText('Skip TLS verification'));
    await user.selectOptions(screen.getByLabelText('Credential for bob'), 'cred-admin');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(submit).toHaveBeenCalledWith({
      ...DEFAULTS,
      name: 'prod-eu-1',
      token: 'fake-token',
      description: 'Main',
      accessMode: 'readWrite',
      isEnabled: false,
      skipTls: true,
      items: [
        { username: 'alice', credentialId: '' },
        { username: 'bob', credentialId: 'cred-admin' },
      ],
    });
  });

  it('password field has autoComplete off and toggles visibility', async () => {
    const { user } = renderDemo();
    const token = screen.getByLabelText('Token');

    expect(token).toHaveAttribute('type', 'password');
    expect(token).toHaveAttribute('autocomplete', 'off');

    await user.click(screen.getByRole('button', { name: 'Show Token' }));
    expect(token).toHaveAttribute('type', 'text');

    await user.click(screen.getByRole('button', { name: 'Hide Token' }));
    expect(token).toHaveAttribute('type', 'password');
  });
});

describe('applyServerErrors', () => {
  it('maps a 400 onto a nested array field and focuses it', async () => {
    const { user } = renderDemo(
      rejectWith({
        status: 400,
        code: 'Validation.Failed',
        title: 'Validation failed',
        fieldErrors: { 'items[1].credentialId': ['Credential does not belong to prod-eu-1.', 'Second message.'] },
      }),
    );

    await user.type(screen.getByLabelText(/^Name/), 'prod-eu-1');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    const select = await screen.findByLabelText('Credential for bob');
    expect(select).toHaveAccessibleDescription(/Credential does not belong to prod-eu-1\./);
    expect(select).toHaveAttribute('aria-invalid', 'true');
    expect(select).toHaveFocus();
    expect(screen.getByLabelText('Credential for alice')).toHaveAttribute('aria-invalid', 'false');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it("puts the '' key and unknown keys into FormProblemAlert, matched keys on fields", async () => {
    const { user } = renderDemo(
      rejectWith({
        status: 400,
        code: 'Validation.Failed',
        title: 'Validation failed',
        detail: 'One or more fields are invalid.',
        fieldErrors: {
          '': ['At least one item is required.'],
          'items[5].credentialId': ['Unknown credential.'],
          accessMode: ['Pick an access mode.'],
        },
      }),
    );

    await user.type(screen.getByLabelText(/^Name/), 'prod-eu-1');
    await user.click(screen.getByLabelText('Read-write'));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('heading', { name: /One or more fields are invalid\./ })).toBeInTheDocument();
    // The alert's list is the only list in the demo form.
    const items = screen.getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual(['At least one item is required.', 'Unknown credential.']);
    expect(screen.getByRole('radiogroup', { name: 'Access mode' })).toHaveAccessibleDescription(
      /Pick an access mode\./,
    );
    // The checked radio gets focus, not the first one.
    expect(screen.getByLabelText('Read-write')).toHaveFocus();
    expect(screen.queryByRole('button', { name: 'Reload latest values' })).not.toBeInTheDocument();
  });

  it('maps a 409 code to a field via codeToField', async () => {
    const { user } = renderDemo(
      rejectWith({
        status: 409,
        code: 'Clusters.NameTaken',
        title: 'Conflict',
        detail: 'Cluster prod-eu-1 already exists.',
      }),
    );

    await user.type(screen.getByLabelText(/^Name/), 'prod-eu-1');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    const name = screen.getByLabelText(/^Name/);
    expect(await screen.findByText('Cluster prod-eu-1 already exists.')).toBeInTheDocument();
    expect(name).toHaveAccessibleDescription(/Cluster prod-eu-1 already exists\./);
    expect(name).toHaveFocus();
  });

  it('keeps typed values on Concurrency.Conflict and reloads only from the alert action', async () => {
    const onReload = vi.fn();
    const { user } = renderDemo(
      rejectWith({
        status: 409,
        code: 'Concurrency.Conflict',
        title: 'Conflict',
        detail: 'This cluster was changed by someone else. Reload and try again.',
      }),
      onReload,
    );

    await user.type(screen.getByLabelText(/^Name/), 'prod-eu-1');
    await user.type(screen.getByLabelText('Description'), 'Edited');
    await user.click(screen.getByLabelText('Read-write'));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText('This cluster was changed by someone else. Reload and try again.'),
    ).toBeInTheDocument();
    // FormProblemAlert leaves conflicts to ConflictAlert: shown once.
    expect(screen.getAllByText('This cluster was changed by someone else. Reload and try again.')).toHaveLength(1);
    expect(screen.getByLabelText(/^Name/)).toHaveValue('prod-eu-1');
    expect(screen.getByLabelText('Description')).toHaveValue('Edited');
    expect(screen.getByLabelText('Read-write')).toBeChecked();
    expect(onReload).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Reload latest values' }));
    expect(onReload).toHaveBeenCalledTimes(1);
    // clearProblem removes the alert once the caller has reloaded.
    expect(screen.queryByText(/changed by someone else/)).not.toBeInTheDocument();
  });

  it('sends collection keys (bulk grant `items`) and the hidden `version` to the alert, not to a field', async () => {
    const { user } = renderDemo(
      rejectWith({
        status: 400,
        code: 'Validation.Failed',
        title: 'Validation failed',
        fieldErrors: { items: ['Add 1–100 entries.'], version: ['Version is required.'] },
      }),
    );

    await user.type(screen.getByLabelText(/^Name/), 'prod-eu-1');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    const items = await screen.findAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual(['Add 1–100 entries.', 'Version is required.']);
  });

  it('returns a problem (not null) for a collection key', () => {
    const { result } = renderHook(() => useForm<DemoValues>({ defaultValues: DEFAULTS }));
    const error = new ApiError({ status: 400, title: 'Validation failed', fieldErrors: { items: ['Too many.'] } });

    let problem: ReturnType<typeof applyServerErrors> = null;
    act(() => {
      problem = applyServerErrors(error, result.current);
    });

    expect(problem).toEqual({ title: 'Validation failed', detail: undefined, messages: ['Too many.'], isConflict: false });
    expect(result.current.getFieldState('items').error).toBeUndefined();
  });

  it('clears the previous alert when the form is submitted again', async () => {
    const submit = vi
      .fn<(values: DemoValues) => Promise<void>>()
      .mockRejectedValueOnce(new ApiError({ status: 400, title: 'Bad Request', detail: 'Malformed JSON.' }))
      .mockResolvedValueOnce(undefined);
    const { user } = renderDemo(submit);

    await user.type(screen.getByLabelText(/^Name/), 'prod-eu-1');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Malformed JSON.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(2));
    expect(screen.queryByText('Malformed JSON.')).not.toBeInTheDocument();
  });

  it('clears a stale alert even when the resubmit fails client validation', async () => {
    const { user } = renderDemo(rejectWith({ status: 400, title: 'Bad Request', detail: 'Malformed JSON.' }));

    await user.type(screen.getByLabelText(/^Name/), 'prod-eu-1');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Malformed JSON.')).toBeInTheDocument();

    await user.clear(screen.getByLabelText(/^Name/));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Required.')).toBeInTheDocument();
    expect(screen.queryByText('Malformed JSON.')).not.toBeInTheDocument();
  });

  it('shows a framework 400 without code or errors as a form problem', async () => {
    const { user } = renderDemo(rejectWith({ status: 400, title: 'Bad Request', detail: 'Malformed JSON.' }));

    await user.type(screen.getByLabelText(/^Name/), 'prod-eu-1');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Malformed JSON.')).toBeInTheDocument();
  });

  it('shows non-API errors as a generic form problem', async () => {
    const { user } = renderDemo(() => Promise.reject(new Error('boom')));

    await user.type(screen.getByLabelText(/^Name/), 'prod-eu-1');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Something went wrong. Please try again.')).toBeInTheDocument();
    expect(screen.queryByText('boom')).not.toBeInTheDocument();
  });
});

describe('ConflictAlert', () => {
  it('disables the action while reloading', () => {
    render(
      <ConflictAlert
        problem={{ title: 'Conflict', detail: 'Changed.', messages: [], isConflict: true }}
        onReload={() => undefined}
        isReloading
      />,
    );
    expect(screen.getByRole('button', { name: /Reload latest values/ })).toBeDisabled();
  });
});

describe('toFormPath', () => {
  it.each([
    ['items[2].credentialId', 'items.2.credentialId'],
    ['name', 'name'],
    ['', ''],
    ['[0].name', '0.name'],
    ['$.items[1].username', 'items.1.username'],
    ['grants[10].targets[3]', 'grants.10.targets.3'],
  ])('%s → %s', (input, expected) => {
    expect(toFormPath(input)).toBe(expected);
  });
});

describe('dnsLabel', () => {
  it.each(['a', 'prod-eu-1', '0abc'])('accepts %s', (value) => {
    expect(dnsLabel(40).safeParse(value).success).toBe(true);
  });

  it.each(['', '-a', 'a-', 'Prod', 'a_b', 'a'.repeat(41)])('rejects %j', (value) => {
    expect(dnsLabel(40).safeParse(value).success).toBe(false);
  });

  it('uses a custom required message', () => {
    const result = dnsLabel(40, { requiredMessage: 'Name is required.' }).safeParse('');
    expect(result.error?.issues[0]?.message).toBe('Name is required.');
  });
});

describe('ChipInputField', () => {
  const chipSchema = z.object({ tags: z.array(z.string().regex(/^[a-z]+$/, 'Bad tag.')).max(3, 'Up to 3.') });
  type ChipValues = z.infer<typeof chipSchema>;
  type ChipSubmit = (values: ChipValues, form: UseFormReturn<ChipValues>) => void;

  /** A form with one chip field prefilled with `alpha`; `submit` gets the values and the form. */
  function ChipDemo({ submit }: { submit: ChipSubmit }) {
    const form = useForm<ChipValues>({ resolver: zodResolver(chipSchema), defaultValues: { tags: ['alpha'] } });
    return (
      <Form noValidate onSubmit={(event) => void form.handleSubmit((values) => submit(values, form))(event)}>
        <ChipInputField control={form.control} name="tags" label="Tags" helperText="Some tags." maxItems={3} />
        <Button type="submit">Save</Button>
      </Form>
    );
  }

  it('links label and helper, splits pastes, removes and clears chips, and never submits on Enter', async () => {
    const submit = vi.fn<ChipSubmit>();
    const user = userEvent.setup();
    render(<ChipDemo submit={submit} />);
    const input = screen.getByRole('textbox', { name: 'Tags' });
    expect(input).toHaveAttribute('id', 'field-tags');
    expect(input).toHaveAttribute('aria-describedby', 'field-tags-helper');
    expect(screen.getByText('Some tags. 1 of 3').closest('#field-tags-helper')).not.toBeNull();

    await user.click(input);
    await user.paste('beta, gamma,del');
    expect(input).toHaveValue('del');
    await user.keyboard('{Enter}');
    expect(submit).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Remove alpha' }));
    expect(screen.getByText('Some tags. 3 of 3')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(submit).toHaveBeenCalledWith({ tags: ['beta', 'gamma', 'del'] }, expect.anything());
    await user.click(screen.getByRole('button', { name: 'Clear Tags' }));
    expect(screen.queryByRole('list', { name: 'Tags entries' })).not.toBeInTheDocument();
    expect(screen.getByText('Some tags.')).toBeInTheDocument();
  });

  it('shows entry and list errors from zod and from the server (listFields) on the field', async () => {
    const user = userEvent.setup();
    const rejectTags: ChipSubmit = (_values, form) => {
      const error = new ApiError({
        status: 400,
        title: 'Validation failed',
        fieldErrors: { 'tags[0]': ['Unknown tag alpha.'], tags: ['Too many.'] },
      });
      expect(applyServerErrors(error, form, { listFields: ['tags'] })).toBeNull();
    };
    render(<ChipDemo submit={rejectTags} />);
    const input = screen.getByRole('textbox', { name: 'Tags' });
    await user.type(input, 'B2{Enter}');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Bad tag.')).toBeInTheDocument();
    expect(input).toHaveAttribute('aria-invalid', 'true');

    await user.click(screen.getByRole('button', { name: 'Remove B2' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Too many. Unknown tag alpha.')).toBeInTheDocument();
  });
});
