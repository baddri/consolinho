import { Dropdown, DropdownItem, DropdownList, MenuToggle } from '@patternfly/react-core';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { ApiError } from '@/shared/api';
import {
  ActionButton,
  ConfirmModal,
  disabledActionProps,
  EnvironmentLabel,
  environmentLabel,
  ErrorState,
  LabelList,
  RelativeTime,
  TOAST_TIMEOUT_MS,
  ToastProvider,
  useToast,
  type ConfirmModalProps,
} from '.';

const forbidden = new ApiError({
  status: 403,
  code: 'Auth.ReadOnly',
  title: 'Forbidden',
  detail: 'Your account is read-only.',
});

describe('ToastProvider / useToast', () => {
  function Notifier() {
    const toast = useToast();
    return (
      <>
        <button type="button" onClick={() => toast.success('Granted alice ReadOnly on prod-eu-1')}>
          Grant
        </button>
        <button type="button" onClick={() => toast.danger('Could not disable', 'Cluster is in use.')}>
          Fail
        </button>
      </>
    );
  }

  it('shows a toast inside a polite live region so it is announced', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <Notifier />
      </ToastProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Grant' }));

    const title = await screen.findByText('Granted alice ReadOnly on prod-eu-1');
    const region = screen.getByRole('list');
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(region).toContainElement(title);
    expect(within(region).getByText('Success alert:')).toBeInTheDocument();
  });

  it('shows the body and closes with the close button', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <Notifier />
      </ToastProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Fail' }));
    expect(await screen.findByText('Cluster is in use.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Close notification: Could not disable' }));
    expect(screen.queryByText('Could not disable')).not.toBeInTheDocument();
  });

  it('dismisses toasts automatically after the timeout', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const user = userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) });
      render(
        <ToastProvider>
          <Notifier />
        </ToastProvider>,
      );
      await user.click(screen.getByRole('button', { name: 'Grant' }));
      expect(screen.getByText('Granted alice ReadOnly on prod-eu-1')).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(TOAST_TIMEOUT_MS - 100);
      });
      expect(screen.getByText('Granted alice ReadOnly on prod-eu-1')).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(200);
      });
      expect(screen.queryByText('Granted alice ReadOnly on prod-eu-1')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('fails loudly when used outside the provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<Notifier />)).toThrow('useToast must be used within ToastProvider');
  });
});

describe('ConfirmModal', () => {
  function renderModal(props: Partial<ConfirmModalProps> = {}) {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();
    const view = render(
      <ConfirmModal
        isOpen
        title="Delete cluster prod-eu-1?"
        titleLabel={<EnvironmentLabel environment="production" isCompact />}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={onConfirm}
        onClose={onClose}
        {...props}
      >
        Users lose access to prod-eu-1.
      </ConfirmModal>,
    );
    return { ...view, user, onConfirm, onClose };
  }

  it('names the object and cluster, shows the environment label and confirms', async () => {
    const { user, onConfirm, onClose } = renderModal();

    // The environment label is part of the name, so screen readers hear "prod" as sighted users see it.
    const dialog = screen.getByRole('dialog', { name: 'Delete cluster prod-eu-1? prod' });
    expect(dialog).toHaveAccessibleDescription('Users lose access to prod-eu-1.');
    expect(within(dialog).getByRole('heading', { name: 'Delete cluster prod-eu-1?' })).toBeInTheDocument();
    expect(within(dialog).getByText('prod')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('is named by the title alone without a label', () => {
    renderModal({ titleLabel: undefined });

    expect(screen.getByRole('dialog', { name: 'Delete cluster prod-eu-1?' })).toBeInTheDocument();
  });

  it('keeps confirm disabled until the exact text is typed; Enter then confirms', async () => {
    const { user, onConfirm } = renderModal({ typeToConfirm: 'prod-eu-1' });
    const confirm = screen.getByRole('button', { name: 'Delete' });
    const input = screen.getByRole('textbox', { name: 'Type "prod-eu-1" to confirm' });

    expect(confirm).toBeDisabled();
    await user.type(input, 'prod-eu');
    expect(confirm).toBeDisabled();
    await user.type(input, '-1{Enter}');
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(confirm).toBeEnabled();

    await user.type(input, 'x{Enter}');
    expect(confirm).toBeDisabled();
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('resets the typed text when reopened', async () => {
    const { user, rerender } = renderModal({ typeToConfirm: 'prod-eu-1' });
    await user.type(screen.getByRole('textbox'), 'prod-eu-1');

    const props = {
      title: 'Delete cluster prod-eu-1?',
      confirmLabel: 'Delete',
      typeToConfirm: 'prod-eu-1',
      onConfirm: vi.fn(),
      onClose: vi.fn(),
      children: 'Body',
    };
    rerender(<ConfirmModal {...props} isOpen={false} />);
    rerender(<ConfirmModal {...props} isOpen />);

    expect(screen.getByRole('textbox')).toHaveValue('');
  });

  it('shows a spinner and blocks a second confirm while pending, keeping focus on the button', async () => {
    const { user, onConfirm, rerender } = renderModal();
    const confirm = screen.getByRole('button', { name: 'Delete' });
    await user.click(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);

    rerender(
      <ConfirmModal
        isOpen
        isPending
        title="Delete cluster prod-eu-1?"
        confirmLabel="Delete"
        variant="danger"
        onConfirm={onConfirm}
        onClose={vi.fn()}
      >
        Users lose access to prod-eu-1.
      </ConfirmModal>,
    );

    // aria-disabled rather than disabled: a disabled button would drop keyboard focus mid-action.
    expect(confirm).toHaveAttribute('aria-disabled', 'true');
    expect(confirm).toHaveFocus();
    expect(within(confirm).getByRole('progressbar')).toBeInTheDocument();
    await user.click(confirm);
    await user.keyboard('{Enter}');
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('shows the mutation error inline with the server detail and announces it', () => {
    renderModal({ error: forbidden });

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Delete failed')).toBeInTheDocument();
    const detail = within(dialog).getByText('Your account is read-only.');
    expect(detail.closest('[aria-live="polite"]')).not.toBeNull();
  });

  it('renders nothing when closed', () => {
    renderModal({ isOpen: false });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('ActionButton', () => {
  it('stays focusable but not clickable with a reason, and explains it in a tooltip on focus', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <ActionButton onClick={onClick} disabledReason="Your account is read-only">
        Add user
      </ActionButton>,
    );
    const button = screen.getByRole('button', { name: 'Add user' });

    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toBeEnabled();

    await user.tab();
    expect(button).toHaveFocus();
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Your account is read-only');
    expect(button).toHaveAccessibleDescription('Your account is read-only');

    await user.click(button);
    await user.keyboard('{Enter}');
    expect(onClick).not.toHaveBeenCalled();
  });

  it('treats an empty reason as no reason', () => {
    render(<ActionButton disabledReason="">Add user</ActionButton>);
    expect(screen.getByRole('button', { name: 'Add user' })).not.toHaveAttribute('aria-disabled');
  });

  it('behaves like a normal button without a reason', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<ActionButton onClick={onClick}>Add user</ActionButton>);

    const button = screen.getByRole('button', { name: 'Add user' });
    expect(button).not.toHaveAttribute('aria-disabled');
    await user.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe('disabledActionProps', () => {
  it('adds nothing without a reason or with an empty one', () => {
    expect(disabledActionProps()).toEqual({});
    expect(disabledActionProps('')).toEqual({});
  });

  it('aria-disables a dropdown item and explains why', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    function Menu() {
      const [isOpen, setIsOpen] = useState(true);
      return (
        <Dropdown
          isOpen={isOpen}
          onOpenChange={setIsOpen}
          toggle={(ref) => (
            <MenuToggle ref={ref} onClick={() => setIsOpen((o) => !o)}>
              Actions
            </MenuToggle>
          )}
        >
          <DropdownList>
            <DropdownItem onClick={onDelete} {...disabledActionProps('Disable the cluster first')}>
              Delete
            </DropdownItem>
          </DropdownList>
        </Dropdown>
      );
    }
    render(<Menu />);

    const item = screen.getByRole('menuitem', { name: 'Delete' });
    expect(item).toHaveAttribute('aria-disabled', 'true');
    await user.hover(item);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Disable the cluster first');
    await user.click(item);
    expect(onDelete).not.toHaveBeenCalled();
  });
});

describe('ErrorState', () => {
  it('shows the ProblemDetails detail verbatim and retries', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(<ErrorState error={forbidden} title="Could not load users" onRetry={onRetry} />);

    expect(screen.getByText('Could not load users')).toBeInTheDocument();
    expect(screen.getByText('Your account is read-only.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('shows a generic message for unknown errors and no Retry without a handler', () => {
    render(<ErrorState error={new Error('stack trace details')} />);

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('Something went wrong. Please try again.')).toBeInTheDocument();
    expect(screen.queryByText(/stack trace/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });
});

describe('RelativeTime', () => {
  const NOW = new Date('2026-11-19T12:00:00Z');

  beforeEach(() => {
    vi.useFakeTimers({ now: NOW, shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders a past time in a <time> element with the absolute time in a keyboard-reachable tooltip', async () => {
    const user = userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) });
    render(<RelativeTime value="2026-11-19T11:55:00Z" />);

    const time = screen.getByText('5 minutes ago');
    expect(time.tagName).toBe('TIME');
    expect(time).toHaveAttribute('datetime', '2026-11-19T11:55:00Z');

    await user.tab();
    expect(time).toHaveFocus();
    const absolute = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'medium' }).format(
      new Date('2026-11-19T11:55:00Z'),
    );
    expect(await screen.findByRole('tooltip')).toHaveTextContent(absolute);
  });

  it('renders a future time (expiry dates)', () => {
    render(<RelativeTime value="2026-11-22T12:00:00Z" />);
    expect(screen.getByText('in 3 days')).toBeInTheDocument();
  });

  it('renders the empty text for null', () => {
    const { rerender } = render(<RelativeTime value={null} />);
    expect(screen.getByText('—')).toBeInTheDocument();

    rerender(<RelativeTime value={null} emptyText="Never" />);
    expect(screen.getByText('Never')).toBeInTheDocument();
  });

  it('keeps the text current while the page stays open', () => {
    render(<RelativeTime value="2026-11-19T11:55:00Z" />);
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.getByText('6 minutes ago')).toBeInTheDocument();
  });
});

describe('EnvironmentLabel', () => {
  it.each([
    ['production', 'prod', 'red'],
    ['staging', 'staging', 'orange'],
    ['development', 'dev', 'green'],
  ] as const)('labels %s as "%s" in %s', (environment, text, color) => {
    expect(environmentLabel(environment)).toEqual({ text, color });
    render(<EnvironmentLabel environment={environment} />);
    expect(screen.getByText(text)).toBeInTheDocument();
  });
});

describe('LabelList', () => {
  it('collapses after max labels into a "+N" toggle that expands', async () => {
    const user = userEvent.setup();
    render(<LabelList labels={['ops', 'dev', 'sre', 'qa', 'audit']} aria-label="Groups" />);

    expect(screen.getByText('sre')).toBeInTheDocument();
    expect(screen.queryByText('qa')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '+2' }));
    expect(screen.getByText('audit')).toBeInTheDocument();
  });

  it('honours a custom max and renders nothing for an empty list', () => {
    const { container, rerender } = render(<LabelList labels={['ops', 'dev']} max={1} />);
    expect(screen.getByRole('button', { name: '+1' })).toBeInTheDocument();

    rerender(<LabelList labels={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
