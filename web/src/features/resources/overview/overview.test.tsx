import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { ClusterOperatorModel, INVENTORY_LIMIT, type ClusterOperator } from '@/shared/k8s';
import { COLD_START_TEST_TIMEOUT_MS, COLD_START_TIMEOUT_MS, preloadLazyRoutes } from '@/test/coldStart';
import { credentialIds, mockDb, mockK8s, setMockUser } from '@/test/handlers';
import { renderApp } from '@/test/render';
import { server } from '@/test/server';
import { resourceRoutes } from '../routes';
import { operatorHealths, operatorsHealthSummary } from './operatorHealth';
import { countText } from './useResourceCount';

beforeAll(() => preloadLazyRoutes(resourceRoutes));

const slow = { timeout: COLD_START_TEST_TIMEOUT_MS };
const wait = { timeout: COLD_START_TIMEOUT_MS };

/** A ClusterOperator with the given condition statuses (others False / Available True). */
function co(name: string, degraded = false, progressing = false): ClusterOperator {
  const condition = (type: string, value: boolean) => ({
    type,
    status: value ? ('True' as const) : ('False' as const),
  });
  return {
    apiVersion: 'config.openshift.io/v1',
    kind: 'ClusterOperator',
    metadata: { name },
    status: {
      conditions: [
        condition('Available', true),
        condition('Degraded', degraded),
        condition('Progressing', progressing),
      ],
    },
  };
}

/** Gives dev-1 the `dev-2` scenario (test users can't reach the disabled dev-2): `ingress` Degraded. */
function degradeIngressOnDev1() {
  const ingress = mockK8s.get('dev-1', ClusterOperatorModel, undefined, 'ingress') as ClusterOperator;
  const conditions = (ingress.status?.conditions ?? []).map((c) =>
    c.type === 'Degraded' ? { ...c, status: 'True' as const } : c,
  );
  const degraded: ClusterOperator = { ...ingress, status: { ...ingress.status, conditions } };
  mockK8s.upsert('dev-1', degraded);
}

describe('operatorsHealthSummary / countText', () => {
  it('counts the worst state; Degraded and Unavailable together as degraded', () => {
    expect(operatorsHealthSummary(operatorHealths([co('a'), co('b')]))).toEqual({ state: 'ok' });
    expect(operatorsHealthSummary(operatorHealths([co('a', false, true), co('b', true), co('c')]))).toEqual({
      state: 'warning',
      detail: '1 degraded',
    });
    expect(operatorsHealthSummary(operatorHealths([co('a', false, true), co('b')]))).toEqual({
      state: 'updating',
      detail: '1 updating',
    });
  });

  it('marks inexact counts with "+"', () => {
    expect(countText(12, true)).toBe('12');
    expect(countText(500, false)).toBe('500+');
  });
});

describe('ClusterOverviewPage (OVW-1..6)', () => {
  it(
    'shows the four cards; a Degraded operator degrades the cluster and is listed in the popover (OVW-1/3)',
    slow,
    async () => {
      degradeIngressOnDev1();
      const user = userEvent.setup();
      renderApp('/c/dev-1/overview');

      expect(await screen.findByRole('heading', { level: 1, name: 'Overview' }, wait)).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Cluster' })).toBeInTheDocument();
      for (const title of ['Details', 'Status', 'Cluster inventory', 'Activity']) {
        expect(screen.getByText(title)).toBeInTheDocument();
      }
      expect(await screen.findByText('Degraded', {}, wait)).toBeInTheDocument();
      expect(await screen.findByText('1 degraded', {}, wait)).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Operators' }));
      expect(await screen.findByText('Operator status')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'ingress' })).toBeInTheDocument();
      expect(await screen.findByText(/^\d+ Nodes$/, {}, wait)).toBeInTheDocument();
    },
  );

  it('shows an updating cluster as Updating with the ongoing update activity (OVW-3/5)', slow, async () => {
    setMockUser('alice');
    renderApp('/c/staging-eu-1/overview');

    expect(await screen.findByText(/^Updating cluster to /, {}, wait)).toBeInTheDocument();
    expect(screen.getAllByText('Updating').length).toBeGreaterThan(0);
  });

  it('shows the update notice when a cluster version update is available (OVW-3)', slow, async () => {
    setMockUser('alice');
    renderApp('/c/prod-eu-1/overview');

    expect(await screen.findByText('A cluster version update is available', {}, wait)).toBeInTheDocument();
    expect(screen.getByText('There are no ongoing activities.')).toBeInTheDocument();
  });

  it(
    'shows the Kubernetes version and a Nodes item, no Operators, on a plain Kubernetes cluster (OVW-2)',
    slow,
    async () => {
      renderApp('/c/prod-k8s-1/overview');

      expect(await screen.findByText('Kubernetes version', {}, wait)).toBeInTheDocument();
      expect(await screen.findByText(/^v\d+\.\d+\.\d+/, {}, wait)).toBeInTheDocument();
      expect(screen.queryByText('Operators')).not.toBeInTheDocument();
      expect(screen.queryByText('Cluster ID')).not.toBeInTheDocument();
    },
  );

  it('keeps the other cards when ClusterOperators are forbidden (OVW-6)', slow, async () => {
    // ines reads prod-us-1 through its view credential, which may not read ClusterOperators; the fixture credential
    // is expired (every read 502s), so it gets a fresh one here.
    mockDb.credentials = mockDb.credentials.map((c) =>
      c.id === credentialIds.prodUsView ? { ...c, expiresAt: null } : c,
    );
    setMockUser('ines');
    renderApp('/c/prod-us-1/overview');

    expect(await screen.findByText('Cluster ID', {}, wait)).toBeInTheDocument();
    expect(await screen.findByText(/^\d+ Nodes$/, {}, wait)).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Operators' }, wait)).toBeInTheDocument();
    expect(screen.getAllByText('Not available').length).toBeGreaterThan(0);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it(
    'counts with one limited request and shows "+" when only continue comes back (OVW-4)',
    slow,
    async () => {
      const requests: URL[] = [];
      server.use(
        http.get('*/api/clusters/:cluster/k8s/apis/storage.k8s.io/v1/storageclasses', ({ request }) => {
          const url = new URL(request.url);
          if (url.searchParams.has('watch')) return undefined;
          requests.push(url);
          return HttpResponse.json({
            apiVersion: 'storage.k8s.io/v1',
            kind: 'StorageClassList',
            metadata: { continue: 'next' },
            items: [{ metadata: { name: 'fast' } }, { metadata: { name: 'slow' } }],
          });
        }),
      );
      renderApp('/c/dev-1/overview');

      expect(await screen.findByRole('link', { name: '2+ StorageClasses' }, wait)).toBeInTheDocument();
      expect(requests).toHaveLength(1);
      expect(requests[0]?.searchParams.get('limit')).toBe(String(INVENTORY_LIMIT));
    },
  );
  it('links "View all events" in the footer only when more than 50 events exist (OVW-5)', slow, async () => {
    const event = (i: number) => ({
      apiVersion: 'v1',
      kind: 'Event',
      metadata: { name: `e${i}`, namespace: 'shop', uid: `uid-${i}`, resourceVersion: String(i) },
      involvedObject: { kind: 'Pod', name: 'web', namespace: 'shop' },
      type: 'Normal',
      message: `event ${i}`,
      lastTimestamp: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString(),
    });
    server.use(
      http.get('*/api/clusters/:cluster/k8s/api/v1/events', ({ request }) =>
        new URL(request.url).searchParams.has('watch')
          ? undefined
          : HttpResponse.json({
              apiVersion: 'v1',
              kind: 'EventList',
              metadata: { resourceVersion: '100' },
              items: Array.from({ length: 51 }, (_, i) => event(i)),
            }),
      ),
    );
    renderApp('/c/dev-1/overview');

    expect(await screen.findByRole('link', { name: 'View all events' }, wait)).toHaveAttribute(
      'href',
      '/c/dev-1/k8s/all-namespaces/events',
    );
  });
});
