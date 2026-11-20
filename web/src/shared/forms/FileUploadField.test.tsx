import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Form } from '@patternfly/react-core';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { FileUploadField } from '.';

const schema = z.object({ pem: z.string().max(20, 'At most 20 characters.') });
type Values = z.infer<typeof schema>;

/** A one-field form; `submit` receives the parsed values. */
function UploadForm({ submit }: { submit: (values: Values) => void }) {
  const { control, handleSubmit } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { pem: '' } });
  return (
    <Form noValidate onSubmit={(event) => void handleSubmit(submit)(event)}>
      <FileUploadField
        control={control}
        name="pem"
        label="Certificate"
        helperText="PEM text."
        maxSizeBytes={64}
        isMonospace
      />
      <Button type="submit">Save</Button>
    </Form>
  );
}

function renderForm() {
  const submit = vi.fn<(values: Values) => void>();
  const user = userEvent.setup();
  const { container } = render(<UploadForm submit={submit} />);
  // The drop zone's file input is hidden and unlabelled (PatternFly owns it); tests reach it the way a drop would.
  const fileInput = container.querySelector<HTMLInputElement>('input[type="file"]');
  if (fileInput === null) throw new Error('file input not rendered');
  return { user, submit, fileInput, textbox: () => screen.getByRole('textbox', { name: 'Certificate' }) };
}

afterEach(() => vi.restoreAllMocks());

describe('FileUploadField', () => {
  it('labels the text area and links the helper text', () => {
    const { textbox } = renderForm();
    expect(textbox()).toHaveAccessibleDescription('PEM text.');
    expect(textbox()).toHaveAttribute('aria-invalid', 'false');
    expect(textbox().parentElement).toHaveClass('pf-v6-u-font-family-monospace');
  });

  it('links a zod error to the text area and focuses it', async () => {
    const { user, submit, textbox } = renderForm();
    await user.click(textbox());
    await user.paste('x'.repeat(21));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(textbox()).toHaveAttribute('aria-invalid', 'true'));
    expect(textbox()).toHaveAccessibleDescription(expect.stringContaining('At most 20 characters.'));
    expect(textbox()).toHaveFocus();
    expect(submit).not.toHaveBeenCalled();
  });

  it('loads an uploaded file into the value and shows its name', async () => {
    const { user, submit, fileInput, textbox } = renderForm();
    await user.upload(fileInput, new File(['abc'], 'ca.pem', { type: 'text/plain' }));

    await waitFor(() => expect(textbox()).toHaveValue('abc'));
    expect(screen.getByRole('textbox', { name: 'Certificate file name' })).toHaveValue('ca.pem');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(submit).toHaveBeenCalledWith({ pem: 'abc' }, expect.anything()));

    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(textbox()).toHaveValue('');
  });

  it('shows a read failure as the field error until the next edit', async () => {
    vi.spyOn(FileReader.prototype, 'readAsText').mockImplementation(function (this: FileReader) {
      this.onerror?.(new ProgressEvent('error') as ProgressEvent<FileReader>);
    });
    const { user, fileInput, textbox } = renderForm();
    await user.upload(fileInput, new File(['abc'], 'broken.pem', { type: 'text/plain' }));

    await waitFor(() => expect(textbox()).toHaveAttribute('aria-invalid', 'true'));
    expect(textbox()).toHaveAccessibleDescription(
      expect.stringContaining("Couldn't read broken.pem. Try again or paste the content."),
    );
    expect(textbox()).toHaveValue('');

    await user.click(textbox());
    await user.paste('ok');
    expect(textbox()).toHaveAccessibleDescription('PEM text.');
    expect(textbox()).toHaveAttribute('aria-invalid', 'false');
  });

  it('rejects files over maxSizeBytes without reading them', async () => {
    const { user, fileInput, textbox } = renderForm();
    await user.upload(fileInput, new File(['x'.repeat(65)], 'big.pem'));

    await waitFor(() => expect(textbox()).toHaveAccessibleDescription(expect.stringContaining('big.pem is larger than 64 bytes.')));
    expect(textbox()).toHaveValue('');
  });
});
