import { screen, waitFor, within } from '@testing-library/react';
import { setWatchTimingForTests } from '@/shared/k8s';
import { COLD_START_TEST_TIMEOUT_MS, COLD_START_TIMEOUT_MS, preloadLazyRoutes } from '@/test/coldStart';
import { setMockUser } from '@/test/handlers';
import { renderApp } from '@/test/render';
import { resourceRoutes } from '../../routes';
import { base64Size, decodeSecretValue, formatBytes } from './dataValues';

const SECRET_URL = '/c/dev-1/k8s/ns/shop/secrets/db-credentials';
/** The fixture's fake values (`workloadFixtures.ts`). */
const USERNAME = 'shop';
const PASSWORD = 'fake-password-not-real';

beforeAll(() => preloadLazyRoutes(resourceRoutes));

beforeEach(() => {
  onTestFinished(
    setWatchTimingForTests({ flushMs: 10, initialBackoffMs: 20, maxBackoffMs: 40, minStreamMs: 100 }),
  );
});

/** The details tab's "Data" description list, once rendered. */
async function findData(name = 'Data'): Promise<HTMLElement> {
  return screen.findByLabelText(name, { selector: 'dl' }, { timeout: COLD_START_TIMEOUT_MS });
}

/** The `dd` of `term` inside a description list. */
function valueOf(list: HTMLElement, term: string): HTMLElement {
  const group = within(list).getByText(term, { selector: 'dt, dt *' }).closest('div');
  if (!group) throw new Error(`no group for ${term}`);
  return group;
}

describe('data values', () => {
  it('formats sizes and decodes secret values, non-UTF-8 as binary', () => {
    expect(base64Size('aGVsbG8=')).toBe(5);
    expect(formatBytes(1229)).toBe('1.2 KiB');
    expect(formatBytes(3 * 1024 * 1024)).toBe('3 MiB');
    expect(decodeSecretValue(btoa('fake-value'))).toBe('fake-value');
    expect(decodeSecretValue(btoa('\xff\xfe\x00'))).toEqual({ binarySize: 3 });
    expect(decodeSecretValue('%%%')).toEqual({ binarySize: 2 });
  });
});

describe('ConfigMap details (CFG-1)', () => {
  it(
    'shows Data with copyable values, Binary data with sizes, and no Events tab',
    { timeout: COLD_START_TEST_TIMEOUT_MS },
    async () => {
      const { user } = renderApp('/c/dev-1/k8s/ns/shop/configmaps/web-config');

      const data = await findData();
      expect(valueOf(data, 'app.properties')).toHaveTextContent('shop.currency=EUR');
      expect(valueOf(data, 'LOG_LEVEL')).toHaveTextContent('debug');
      expect(screen.getByText('No binary data found')).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'YAML' })).toBeInTheDocument();
      expect(screen.queryByRole('tab', { name: 'Events' })).not.toBeInTheDocument();

      await user.click(within(valueOf(data, 'LOG_LEVEL')).getByRole('button', { name: 'Copy to clipboard' }));
      expect(await navigator.clipboard.readText()).toBe('debug');
    },
  );

  it('lists binary keys with their decoded size', async () => {
    renderApp('/c/dev-1/k8s/ns/shop/configmaps/web-assets');

    const binary = await findData('Binary data');
    expect(valueOf(binary, 'favicon.png')).toHaveTextContent('68 B binary data');
  });
});

describe('Secrets (CFG-2/3)', () => {
  it('lists Name, Namespace, Type, Size and Created', { timeout: COLD_START_TEST_TIMEOUT_MS }, async () => {
    // All namespaces: the Namespace column hides inside one namespace.
    renderApp('/c/dev-1/k8s/all-namespaces/secrets');

    const table = await screen.findByRole('grid', { name: 'Secrets' }, { timeout: COLD_START_TIMEOUT_MS });
    const headers = within(table)
      .getAllByRole('columnheader')
      .map((header) => header.textContent);
    // Resizable headers append their resize handle's label ("Column 210 pixels") to the title.
    for (const title of ['Name', 'Namespace', 'Type', 'Size', 'Created'])
      expect(headers.some((header) => header.startsWith(title))).toBe(true);
    const row = (await within(table).findByRole('link', { name: 'db-credentials' })).closest('tr');
    if (!row) throw new Error('no row');
    expect(within(row).getByText('Opaque')).toBeInTheDocument();
    expect(within(row).getByText('2')).toBeInTheDocument();
  });

  it(
    'masks values, reveals and hides them, copies while masked, and re-masks on remount',
    { timeout: COLD_START_TEST_TIMEOUT_MS },
    async () => {
      const first = renderApp(SECRET_URL);

      const data = await findData();
      expect(screen.getByRole('tab', { name: 'YAML' })).toBeInTheDocument();
      expect(screen.queryByRole('tab', { name: 'Events' })).not.toBeInTheDocument();
      expect(screen.getByText('Opaque')).toBeInTheDocument();
      expect(within(data).getAllByText('Value hidden')).toHaveLength(2);
      expect(within(data).queryByText(USERNAME)).not.toBeInTheDocument();
      expect(screen.queryByText(PASSWORD)).not.toBeInTheDocument();

      await first.user.click(
        within(valueOf(data, 'username')).getByRole('button', { name: 'Copy to clipboard' }),
      );
      expect(await navigator.clipboard.readText()).toBe(USERNAME);

      await first.user.click(screen.getByRole('button', { name: 'Reveal values' }));
      expect(valueOf(data, 'username')).toHaveTextContent(USERNAME);
      expect(valueOf(data, 'password')).toHaveTextContent(PASSWORD);
      expect(within(data).queryByText('Value hidden')).not.toBeInTheDocument();

      await first.user.click(screen.getByRole('button', { name: 'Hide values' }));
      expect(within(data).getAllByText('Value hidden')).toHaveLength(2);
      expect(screen.queryByText(PASSWORD)).not.toBeInTheDocument();

      await first.user.click(screen.getByRole('button', { name: 'Reveal values' }));
      first.unmount();
      renderApp(SECRET_URL);
      expect(within(await findData()).getAllByText('Value hidden')).toHaveLength(2);
      expect(screen.getByRole('button', { name: 'Reveal values' })).toBeInTheDocument();
    },
  );
});

describe('Secret actions (CFG-4/5)', () => {
  it(
    'CFG-4: editing labels toasts only the name and the cluster',
    { timeout: COLD_START_TEST_TIMEOUT_MS },
    async () => {
      const { user } = renderApp(SECRET_URL);

      await user.click(
        await screen.findByRole('button', { name: 'Actions' }, { timeout: COLD_START_TIMEOUT_MS }),
      );
      const item = screen.getByRole('menuitem', { name: 'Edit labels' });
      await waitFor(() => expect(item).not.toHaveAttribute('aria-disabled', 'true'));
      await user.click(item);
      const dialog = await screen.findByRole('dialog', { name: 'Edit labels' });
      await user.type(within(dialog).getByRole('textbox', { name: 'Labels' }), 'tier=db{Enter}');
      await user.click(within(dialog).getByRole('button', { name: 'Save' }));

      const toast = await screen.findByText('Labels of db-credentials updated on Development 1');
      expect(toast.textContent).not.toContain(USERNAME);
      expect(screen.queryByText(new RegExp(PASSWORD))).not.toBeInTheDocument();
    },
  );

  it(
    'CFG-5: on a read-only grant "Reveal values" works and "Edit Secret" is aria-disabled',
    { timeout: COLD_START_TEST_TIMEOUT_MS },
    async () => {
      setMockUser('alice');
      const { user } = renderApp('/c/prod-eu-1/k8s/ns/shop/secrets/db-credentials');

      const data = await findData();
      await user.click(screen.getByRole('button', { name: 'Reveal values' }));
      expect(valueOf(data, 'username')).toHaveTextContent(USERNAME);

      await user.click(screen.getByRole('button', { name: 'Actions' }));
      const edit = screen.getByRole('menuitem', { name: 'Edit Secret' });
      await waitFor(() => expect(edit).toHaveAttribute('aria-disabled', 'true'));
    },
  );
});
