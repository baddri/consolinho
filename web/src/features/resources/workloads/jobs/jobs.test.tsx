import { screen, waitFor, within } from '@testing-library/react';
import { JobModel, setWatchTimingForTests, type Job } from '@/shared/k8s';
import { COLD_START_TEST_TIMEOUT_MS, COLD_START_TIMEOUT_MS, preloadLazyRoutes } from '@/test/coldStart';
import { mockK8s, setMockUser } from '@/test/handlers';
import { renderApp, renderWithProviders } from '@/test/render';
import { server } from '@/test/server';
import { ResourceActionsMenu } from '../../actions/ResourceActionsMenu';
import { jobDescriptor, type JobResource } from '../../registry/kinds/jobs';
import { resourceRoutes } from '../../routes';
import { jobStatus, jobTypeAndCompletions } from './jobDetails';

const DETAILS = '/c/dev-1/k8s/ns/shop/jobs/migrate-db';

beforeAll(() => preloadLazyRoutes(resourceRoutes));

beforeEach(() => {
  onTestFinished(
    setWatchTimingForTests({ flushMs: 10, initialBackoffMs: 20, maxBackoffMs: 40, minStreamMs: 100 }),
  );
});
afterEach(() => server.events.removeAllListeners());

/** The `migrate-db` Job of `dev-1` as the mock stores it. */
function migrateDb(): JobResource {
  const stored = mockK8s.get('dev-1', JobModel, 'shop', 'migrate-db');
  if (!stored) throw new Error('fixture job migrate-db missing');
  return stored as Job as JobResource;
}

/** Records path and body of every PATCH the proxy receives. */
function recordPatches(): { path: string; body: unknown }[] {
  const patches: { path: string; body: unknown }[] = [];
  server.events.on('request:start', ({ request }) => {
    if (request.method !== 'PATCH') return;
    const path = new URL(request.url).pathname;
    void request
      .clone()
      .json()
      .then((body: unknown) => patches.push({ path, body }));
  });
  return patches;
}

/** The details row (`DescriptionListGroup`) labelled `label`. */
function detailsRow(label: string): HTMLElement {
  const row = screen.getByText(label, { selector: 'dt *, dt' }).closest('div');
  if (!row) throw new Error(`no details row ${label}`);
  return row;
}

describe('Jobs (T-0194)', () => {
  it.each<[Job['spec'], string, number]>([
    [{ template: {} }, 'Non-parallel', 1],
    [{ template: {}, completions: 3 }, 'Non-parallel', 3],
    [{ template: {}, completions: 3, parallelism: 2 }, 'Fixed completion count', 3],
    [{ template: {}, parallelism: 2 }, 'Work queue', 1],
  ])('getJobTypeAndCompletions(%o) = %s', (spec, type, completions) => {
    expect(jobTypeAndCompletions({ spec })).toEqual({ type, completions });
  });

  it.each<[Job['status'], string]>([
    [{}, 'In progress'],
    [{ active: 1, conditions: [{ type: 'Suspended', status: 'True' }] }, 'Suspended'],
    [{ conditions: [{ type: 'Failed', status: 'True' }] }, 'Failed'],
  ])('jobStatus(%o) = %s (OCP: first condition type, else In progress)', (status, title) => {
    expect(jobStatus({ spec: { template: {} }, status })).toEqual({ title });
  });

  it(
    'JOB-1: the list shows OCP columns and "1 of 1" links to the Pods tab',
    async () => {
      renderApp('/c/dev-1/k8s/ns/shop/jobs');

      const table = await screen.findByRole('grid', { name: 'Jobs' }, { timeout: COLD_START_TIMEOUT_MS });
      const headers = within(table)
        .getAllByRole('columnheader')
        .map((header) => header.textContent.replace(/Column \d+ pixels$/, ''));
      expect(headers).toEqual(['Name', 'Labels', 'Completions', 'Type', 'Created', 'Actions']);
      const [link] = await within(table).findAllByRole('link', { name: 'migrate-db' });
      const row = link?.closest('tr');
      if (!row) throw new Error('no migrate-db row');
      expect(within(row).getByRole('link', { name: '1 of 1' })).toHaveAttribute('href', `${DETAILS}/pods`);
      expect(row).toHaveTextContent('Non-parallel');
    },
    COLD_START_TEST_TIMEOUT_MS,
  );

  it(
    'JOB-1: details show completions, parallelism, deadline and pod counts; tabs as spec',
    async () => {
      const { user } = renderApp(DETAILS);

      await screen.findByRole('heading', { name: 'Job details' }, { timeout: COLD_START_TIMEOUT_MS });
      expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
        'Details',
        'YAML',
        'Pods',
        'Events',
      ]);
      expect(detailsRow('Desired completions')).toHaveTextContent('1');
      expect(detailsRow('Parallelism')).toHaveTextContent('1');
      expect(detailsRow('Active deadline seconds')).toHaveTextContent('Not configured');
      expect(screen.getByRole('heading', { name: 'Job status' })).toBeInTheDocument();
      expect(detailsRow('Status')).toHaveTextContent('Complete');
      expect(detailsRow('Succeeded pods')).toHaveTextContent('1');
      expect(detailsRow('Active pods')).toHaveTextContent('0');
      expect(detailsRow('Failed pods')).toHaveTextContent('0');
      expect(screen.getByRole('grid', { name: 'Conditions' })).toBeInTheDocument();

      await user.click(screen.getByRole('tab', { name: 'Pods' }));
      const pods = await screen.findByRole('grid', { name: 'Pods' }, { timeout: COLD_START_TIMEOUT_MS });
      expect(await within(pods).findByRole('link', { name: 'migrate-db-x5r7c' })).toBeInTheDocument();
    },
    COLD_START_TEST_TIMEOUT_MS,
  );

  it(
    'JOB-1: Edit parallelism PATCHes replace /spec/parallelism',
    async () => {
      const patches = recordPatches();
      const { user } = renderApp(DETAILS);

      await user.click(
        await screen.findByRole('button', { name: 'Actions' }, { timeout: COLD_START_TIMEOUT_MS }),
      );
      const item = screen.getByRole('menuitem', { name: 'Edit parallelism' });
      await waitFor(() => expect(item).not.toHaveAttribute('aria-disabled', 'true'));
      await user.click(item);
      const dialog = await screen.findByRole('dialog', { name: 'Edit parallelism' });
      await user.click(within(dialog).getByRole('button', { name: 'Increment' }));
      await user.click(within(dialog).getByRole('button', { name: 'Save' }));

      expect(await screen.findByText('migrate-db parallelism set to 2 on Development 1')).toBeInTheDocument();
      expect(patches).toEqual([
        {
          path: expect.stringMatching(/\/namespaces\/shop\/jobs\/migrate-db$/) as unknown,
          body: [{ op: 'replace', path: '/spec/parallelism', value: 2 }],
        },
      ]);
      expect(migrateDb().spec?.parallelism).toBe(2);
    },
    COLD_START_TEST_TIMEOUT_MS,
  );

  it('ACT-4: a read-only grant disables Edit parallelism with the reason', async () => {
    setMockUser('alice');
    const { user } = renderWithProviders(
      <ResourceActionsMenu cluster="prod-eu-1" descriptor={jobDescriptor} obj={migrateDb()} />,
    );

    await user.click(screen.getByRole('button', { name: 'Actions' }));
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Edit parallelism',
      'Edit labels',
      'Edit annotations',
      'Edit Job',
      'Delete Job',
    ]);
    const item = screen.getByRole('menuitem', { name: 'Edit parallelism' });
    await waitFor(() => expect(item).toHaveAttribute('aria-disabled', 'true'));
    await user.hover(item);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Your access to prod-eu-1 is read-only.');
  });
});
