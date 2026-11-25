import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { CronJobModel, setWatchTimingForTests, type CronJob, type Job } from '@/shared/k8s';
import { COLD_START_TEST_TIMEOUT_MS, COLD_START_TIMEOUT_MS, preloadLazyRoutes } from '@/test/coldStart';
import { mockK8s, setMockUser } from '@/test/handlers';
import { renderApp, renderWithProviders } from '@/test/render';
import { server } from '@/test/server';
import { ResourceActionsMenu } from '../../actions/ResourceActionsMenu';
import { cronJobDescriptor, type CronJobResource } from '../../registry/kinds/cronjobs';
import { resourceRoutes } from '../../routes';
import { INSTANTIATE_ANNOTATION, startJobPayload } from './useStartJob';

const PROXY = '*/api/clusters/:cluster/k8s/*';
const DETAILS = '/c/dev-1/k8s/ns/shop/cronjobs/nightly-report';
const OWNED_JOBS = ['nightly-report-29101440', 'nightly-report-29100000'];

beforeAll(() => preloadLazyRoutes(resourceRoutes));

beforeEach(() => {
  onTestFinished(
    setWatchTimingForTests({ flushMs: 10, initialBackoffMs: 20, maxBackoffMs: 40, minStreamMs: 100 }),
  );
});
afterEach(() => server.events.removeAllListeners());

/** The `nightly-report` CronJob of `dev-1` as the mock stores it. */
function nightlyReport(): CronJobResource {
  const stored = mockK8s.get('dev-1', CronJobModel, 'shop', 'nightly-report');
  if (!stored) throw new Error('fixture cronjob nightly-report missing');
  return stored as CronJob as CronJobResource;
}

/** Records every Job the proxy is asked to create. */
function recordJobPosts(): Job[] {
  const posts: Job[] = [];
  server.events.on('request:start', ({ request }) => {
    if (request.method !== 'POST' || !new URL(request.url).pathname.endsWith('/namespaces/shop/jobs')) return;
    void request
      .clone()
      .json()
      .then((body: unknown) => posts.push(body as Job));
  });
  return posts;
}

/** The details row (`DescriptionListGroup`) labelled `label`. */
function detailsRow(label: string): HTMLElement {
  const row = screen.getByText(label, { selector: 'dt *, dt' }).closest('div');
  if (!row) throw new Error(`no details row ${label}`);
  return row;
}

/** Opens the details page's Actions menu and clicks `name` once its access review allowed it. */
async function clickAction(user: ReturnType<typeof renderApp>['user'], name: string): Promise<void> {
  await user.click(
    await screen.findByRole('button', { name: 'Actions' }, { timeout: COLD_START_TIMEOUT_MS }),
  );
  const item = screen.getByRole('menuitem', { name });
  await waitFor(() => expect(item).not.toHaveAttribute('aria-disabled', 'true'));
  await user.click(item);
}

describe('CronJobs (T-0194)', () => {
  it(
    'CJ-1: the list shows OCP columns',
    async () => {
      renderApp('/c/dev-1/k8s/ns/shop/cronjobs');

      const table = await screen.findByRole('grid', { name: 'CronJobs' }, { timeout: COLD_START_TIMEOUT_MS });
      const headers = within(table)
        .getAllByRole('columnheader')
        .map((header) => header.textContent.replace(/Column \d+ pixels$/, ''));
      expect(headers).toEqual([
        'Name',
        'Schedule',
        'Suspend',
        'Concurrency policy',
        'Starting deadline seconds',
        'Actions',
      ]);
      const [link] = await within(table).findAllByRole('link', { name: 'nightly-report' });
      const row = link?.closest('tr');
      if (!row) throw new Error('no nightly-report row');
      const cells = within(row).getAllByRole('cell').map((cell) => cell.textContent);
      expect(cells.slice(1, 5)).toEqual(['0 2 * * *', 'False', 'Forbid', '-']);
    },
    COLD_START_TEST_TIMEOUT_MS,
  );

  it(
    'CJ-1: details show the schedule fields; Jobs and Pods tabs list the owned Jobs and their pods',
    async () => {
      const { user } = renderApp(DETAILS);

      await screen.findByRole('heading', { name: 'CronJob details' }, { timeout: COLD_START_TIMEOUT_MS });
      expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
        'Details',
        'YAML',
        'Pods',
        'Jobs',
        'Events',
      ]);
      expect(detailsRow('Schedule')).toHaveTextContent('0 2 * * *');
      expect(detailsRow('Suspend')).toHaveTextContent('False');
      expect(detailsRow('Concurrency policy')).toHaveTextContent('Forbid');
      expect(detailsRow('Starting deadline seconds')).toHaveTextContent('Not configured');
      expect(detailsRow('Last schedule time')).not.toHaveTextContent('-');
      expect(detailsRow('Desired completions')).toHaveTextContent('-');
      expect(screen.getByRole('heading', { name: 'Job details' })).toBeInTheDocument();

      await user.click(screen.getByRole('tab', { name: 'Jobs' }));
      const jobs = await screen.findByRole('grid', { name: 'Jobs' }, { timeout: COLD_START_TIMEOUT_MS });
      await within(jobs).findAllByRole('link', { name: OWNED_JOBS[0] });
      expect(
        within(jobs)
          .getAllByRole('columnheader')
          .map((header) => header.textContent.replace(/Column \d+ pixels$/, '')),
      ).toEqual(['Name', 'Labels', 'Completions', 'Type', 'Created', 'Actions']);
      const jobRows = within(jobs).getAllByRole('row').slice(1);
      // Newest first; the standalone `migrate-db` is not the CronJob's.
      expect(jobRows.map((row) => within(row).getAllByRole('link')[0]?.textContent)).toEqual(OWNED_JOBS);
      expect(jobRows[0]).toHaveTextContent('1 of 1');

      await user.click(screen.getByRole('tab', { name: 'Pods' }));
      const pods = await screen.findByRole('grid', { name: 'Pods' }, { timeout: COLD_START_TIMEOUT_MS });
      for (const job of OWNED_JOBS) {
        expect(await within(pods).findByRole('link', { name: `${job}-x5r7c` })).toBeInTheDocument();
      }
      expect(within(pods).queryByRole('link', { name: 'migrate-db-x5r7c' })).not.toBeInTheDocument();
      expect(within(pods).getAllByRole('row')).toHaveLength(3);
    },
    COLD_START_TEST_TIMEOUT_MS,
  );

  it('CJ-2: the Job payload carries the name pattern, instantiate annotation and controller ownerRef', () => {
    const cronJob = nightlyReport();
    const job = startJobPayload(cronJob, 1_700_000_000_999);

    expect(job.metadata?.name).toBe('nightly-report-1700000000');
    expect(job.metadata?.annotations).toEqual({ [INSTANTIATE_ANNOTATION]: 'manual' });
    expect(job.metadata?.ownerReferences).toEqual([
      {
        apiVersion: 'batch/v1',
        kind: 'CronJob',
        name: 'nightly-report',
        uid: cronJob.metadata.uid,
        controller: true,
        blockOwnerDeletion: true,
      },
    ]);
    expect(job.spec).toEqual(cronJob.spec?.jobTemplate.spec);

    const long = { ...cronJob, metadata: { ...cronJob.metadata, name: 'x'.repeat(60) } };
    expect(startJobPayload(long, 1_700_000_000_000).metadata?.name).toBe(`${'x'.repeat(52)}-1700000000`);
  });

  it(
    'CJ-2: Start Job POSTs the Job and lands on its details',
    async () => {
      const posts = recordJobPosts();
      const { user, router } = renderApp(DETAILS);

      await clickAction(user, 'Start Job');

      await waitFor(() =>
        expect(router.state.location.pathname).toMatch(/^\/c\/dev-1\/k8s\/ns\/shop\/jobs\/nightly-report-\d{10}$/),
      );
      expect(posts).toHaveLength(1);
      expect(posts[0]?.metadata?.annotations?.[INSTANTIATE_ANNOTATION]).toBe('manual');
      expect(posts[0]?.metadata?.ownerReferences?.[0]).toMatchObject({ kind: 'CronJob', controller: true });
      expect(
        await screen.findByRole('heading', { name: 'Job details' }, { timeout: COLD_START_TIMEOUT_MS }),
      ).toBeInTheDocument();
    },
    COLD_START_TEST_TIMEOUT_MS,
  );

  it.each([403, 500])(
    'CJ-2: a %d shows the warning toast "Failed to start a Job."',
    async (code) => {
      server.use(
        http.post(PROXY, ({ request }) => {
          if (!new URL(request.url).pathname.endsWith('/namespaces/shop/jobs')) return undefined;
          return HttpResponse.json(
            { kind: 'Status', apiVersion: 'v1', status: 'Failure', message: 'jobs are not allowed here', code },
            { status: code },
          );
        }),
      );
      const { user, router } = renderApp(DETAILS);

      await clickAction(user, 'Start Job');

      const toast = await screen.findByText('Failed to start a Job.');
      expect(toast.closest('li')).toHaveTextContent('jobs are not allowed here');
      expect(router.state.location.pathname).toBe(DETAILS);
    },
    COLD_START_TEST_TIMEOUT_MS,
  );

  it(
    'CJ-3: Suspend patches spec.suspend, shows "Suspended" and offers Resume',
    async () => {
      const { user } = renderApp(DETAILS);

      await clickAction(user, 'Suspend');

      expect(await screen.findByText('Suspended nightly-report on Development 1')).toBeInTheDocument();
      expect(nightlyReport().spec?.suspend).toBe(true);
      // The heading's status badge (descriptor `status`).
      expect(await screen.findByText('Suspended')).toBeInTheDocument();
      await waitFor(() => expect(detailsRow('Suspend')).toHaveTextContent('True'));

      await clickAction(user, 'Resume');
      expect(await screen.findByText('Resumed nightly-report on Development 1')).toBeInTheDocument();
      expect(nightlyReport().spec?.suspend).toBe(false);
    },
    COLD_START_TEST_TIMEOUT_MS,
  );

  it(
    'the list sends no access review on render; hovering a kebab checks Start Job and Suspend (T-0370)',
    async () => {
      const reviewed: string[] = [];
      server.events.on('request:start', ({ request }) => {
        if (request.method !== 'POST' || !request.url.endsWith('/selfsubjectaccessreviews')) return;
        void request
          .clone()
          .json()
          .then((body: { spec: { resourceAttributes: { resource: string; verb: string } } }) => {
            const { verb, resource } = body.spec.resourceAttributes;
            reviewed.push(`${verb} ${resource}`);
          });
      });
      const { user } = renderApp('/c/dev-1/k8s/ns/shop/cronjobs');

      const link = await screen.findByRole('link', { name: 'nightly-report' }, { timeout: COLD_START_TIMEOUT_MS });
      const row = link.closest('tr');
      if (!row) throw new Error('no row');
      expect(reviewed).toEqual([]);

      await user.hover(within(row).getByRole('button', { name: 'Kebab toggle' }));
      await waitFor(() => expect(reviewed).toEqual(expect.arrayContaining(['create jobs', 'patch cronjobs'])));
    },
    COLD_START_TEST_TIMEOUT_MS,
  );

  it('ACT-4: a read-only grant disables every kind item with the reason', async () => {
    setMockUser('alice');
    const posts = recordJobPosts();
    const { user } = renderWithProviders(
      <ResourceActionsMenu cluster="prod-eu-1" descriptor={cronJobDescriptor} obj={nightlyReport()} />,
    );

    await user.click(screen.getByRole('button', { name: 'Actions' }));
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Start Job',
      'Suspend',
      'Edit labels',
      'Edit annotations',
      'Edit CronJob',
      'Delete CronJob',
    ]);
    for (const name of ['Start Job', 'Suspend']) {
      const item = screen.getByRole('menuitem', { name });
      await waitFor(() => expect(item).toHaveAttribute('aria-disabled', 'true'));
      await user.hover(item);
      expect(await screen.findByRole('tooltip')).toHaveTextContent('Your access to prod-eu-1 is read-only.');
      await user.click(item);
      await user.unhover(item);
      await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument());
    }
    expect(posts).toEqual([]);
    expect(nightlyReport().spec?.suspend).toBe(false);
  });
});
