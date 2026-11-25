import { render, screen, within } from '@testing-library/react';
import { SubscriptionModel } from '@/shared/k8s';
import { COLD_START_TEST_TIMEOUT_MS, COLD_START_TIMEOUT_MS, preloadLazyRoutes } from '@/test/coldStart';
import { mockK8s } from '@/test/handlers';
import { renderApp } from '@/test/render';
import { server } from '@/test/server';
import { resourceRoutes } from '../routes';
import { MarkdownView } from './MarkdownView';
import { csvIconSrc, type CsvResource, type SubscriptionResource } from './csv';

beforeAll(() => preloadLazyRoutes(resourceRoutes));

const ALL = '/c/dev-1/k8s/all-namespaces/clusterserviceversions';
const OPS = '/c/dev-1/k8s/ns/openshift-operators/clusterserviceversions';
const CERT_UTILS = 'cert-utils-operator.v1.3.12';

/** A CSV whose only field is `spec.icon`. */
function withIcon(base64data: string, mediatype: string): Pick<CsvResource, 'spec'> {
  return { spec: { icon: [{ base64data, mediatype }] } };
}

/** The table row whose name link starts with `displayName`. */
async function findRow(table: HTMLElement, displayName: string): Promise<HTMLElement> {
  const link = await within(table).findByRole('link', { name: new RegExp(`^${displayName}`) });
  const row = link.closest('tr');
  if (!row) throw new Error(`no row for ${displayName}`);
  return row;
}

/** `labelSelector` of every CSV list request (`null` without one). */
function recordCsvListSelectors(): (string | null)[] {
  const selectors: (string | null)[] = [];
  const listener = ({ request }: { request: Request }) => {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname.endsWith('/clusterserviceversions')) {
      selectors.push(url.searchParams.get('labelSelector'));
    }
  };
  server.events.on('request:start', listener);
  onTestFinished(() => {
    server.events.removeListener('request:start', listener);
  });
  return selectors;
}

describe('csvIconSrc', () => {
  it('accepts base64 image data URIs only, so the CSP-safe placeholder shows otherwise', () => {
    expect(csvIconSrc(withIcon('PHN2Zz48L3N2Zz4=', 'image/svg+xml'))).toBe('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=');
    expect(csvIconSrc(withIcon('iVBORw0K\nGgo=', 'image/png'))).toBe('data:image/png;base64,iVBORw0KGgo=');
    expect(csvIconSrc(withIcon('https://evil.example.com/x.png', 'image/png'))).toBeUndefined();
    expect(csvIconSrc(withIcon('PHN2Zz4=', 'text/html'))).toBeUndefined();
    expect(csvIconSrc({ spec: {} })).toBeUndefined();
  });
});

describe('MarkdownView', () => {
  it('links absolute http(s) URLs only; relative and javascript: links become plain text', () => {
    render(
      <MarkdownView content={'[site](https://example.com/a) [rel](/c/dev-1/k8s) [js](javascript:alert(1)) [mail](mailto:a@example.com)'} />,
    );
    expect(screen.getByRole('link', { name: 'site' })).toHaveAttribute('href', 'https://example.com/a');
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(screen.getByText('rel')).toBeInTheDocument();
    expect(screen.getByText('js')).toBeInTheDocument();
    expect(screen.getByText('mail')).toBeInTheDocument();
  });
});

describe('Installed Operators (T-0337)', () => {
  it(
    'OLM-1: the all-namespaces list shows OCP columns, each operator once, with status and provided APIs',
    async () => {
      const selectors = recordCsvListSelectors();
      renderApp(ALL);
      const table = await screen.findByRole(
        'grid',
        { name: 'ClusterServiceVersions' },
        { timeout: COLD_START_TIMEOUT_MS },
      );
      const headers = within(table)
        .getAllByRole('columnheader')
        .map((header) => header.textContent.replace(/Column \d+ pixels$/, ''));
      expect(headers).toEqual([
        'Name',
        'Namespace',
        'Managed Namespaces',
        'Status',
        'Provided APIs',
        'Last updated',
      ]);

      const certUtils = await findRow(table, 'Cert Utils Operator');
      expect(within(table).getAllByRole('link', { name: /^Cert Utils Operator/ })).toHaveLength(1);
      expect(certUtils).toHaveTextContent('1.3.12 provided by Example Community');
      expect(certUtils).toHaveTextContent('All Namespaces');
      expect(certUtils).toHaveTextContent('Succeeded');
      expect(certUtils).toHaveTextContent('Certificate Sync');
      expect(certUtils).not.toHaveTextContent('Keystore Export');
      expect(within(certUtils).getByRole('link', { name: 'View 1 more...' })).toHaveAttribute(
        'href',
        `${OPS}/${CERT_UTILS}`,
      );
      const failed = await findRow(table, 'Log Forwarder Operator');
      expect(failed).toHaveTextContent('Failed');
      expect(failed).toHaveTextContent('InstallComponentFailed');
      expect(selectors.every((selector) => selector === '!olm.copiedFrom')).toBe(true);
    },
    COLD_START_TEST_TIMEOUT_MS,
  );

  it(
    'OLM-2/5: details render the markdown description without raw HTML, the sidebar and no edit actions',
    async () => {
      renderApp(`${OPS}/${CERT_UTILS}`);
      expect(
        await screen.findByRole('heading', { name: 'About Cert Utils Operator' }, { timeout: COLD_START_TIMEOUT_MS }),
      ).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'documentation' })).toHaveAttribute('rel', 'noopener noreferrer');
      expect(screen.queryByText(/not rendered/)).not.toBeInTheDocument();
      expect(screen.getByText('Keystore Export')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'maintainers@example.com' })).toHaveAttribute(
        'href',
        'mailto:maintainers@example.com',
      );
      expect(screen.getByText('global-operators')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Actions' })).not.toBeInTheDocument();
    },
    COLD_START_TEST_TIMEOUT_MS,
  );

  it(
    'OLM-2: a failed operator shows the danger alert with its message',
    async () => {
      renderApp(`${OPS}/log-forwarder-operator.v5.9.3`);
      expect(
        await screen.findByText('Operator failed', undefined, { timeout: COLD_START_TIMEOUT_MS }),
      ).toBeInTheDocument();
      expect(screen.getAllByText(/spec\.template\.spec\.containers\[0\]\.image: Required value/).length).toBeGreaterThan(
        0,
      );
    },
    COLD_START_TEST_TIMEOUT_MS,
  );

  it(
    'OLM-4: the Subscription tab shows channel, Manual approval and the InstallPlan awaiting approval',
    async () => {
      renderApp(`${OPS}/${CERT_UTILS}/subscription`);
      expect(
        await screen.findByRole('heading', { name: 'Subscription details' }, { timeout: COLD_START_TIMEOUT_MS }),
      ).toBeInTheDocument();
      expect(await screen.findByText('1 requires approval')).toBeInTheDocument();
      expect(screen.getByText('Upgrade available')).toBeInTheDocument();
      expect(screen.getByText('stable')).toBeInTheDocument();
      expect(screen.getByText('Manual')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: '1 installed' })).toHaveAttribute('href', `${OPS}/${CERT_UTILS}`);
      expect(screen.getByText('community-operators (openshift-marketplace)')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /approve|edit|uninstall/i })).not.toBeInTheDocument();
    },
    COLD_START_TEST_TIMEOUT_MS,
  );

  it(
    'OLM-4: without a Subscription the tab says so',
    async () => {
      const subscription = mockK8s.get(
        'dev-1',
        SubscriptionModel,
        'openshift-operators',
        'pipeline-runner-operator',
      ) as SubscriptionResource;
      const orphaned: SubscriptionResource = {
        ...subscription,
        status: { ...subscription.status, installedCSV: undefined },
      };
      mockK8s.upsert('dev-1', orphaned);
      renderApp(`${OPS}/pipeline-runner-operator.v1.15.0/subscription`);
      expect(
        await screen.findByRole('heading', { name: 'No Operator Subscription' }, { timeout: COLD_START_TIMEOUT_MS }),
      ).toBeInTheDocument();
    },
    COLD_START_TEST_TIMEOUT_MS,
  );

  it(
    'OLM-5: the YAML tab is read-only',
    async () => {
      renderApp(`${OPS}/${CERT_UTILS}/yaml`);
      expect(
        await screen.findByRole('textbox', { name: 'YAML editor' }, { timeout: COLD_START_TIMEOUT_MS }),
      ).toHaveAttribute('readonly');
      expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
    },
    COLD_START_TEST_TIMEOUT_MS,
  );
});
