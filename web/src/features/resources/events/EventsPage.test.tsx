import { screen, waitFor, within } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { setWatchTimingForTests, type K8sResource } from '@/shared/k8s';
import { COLD_START_TEST_TIMEOUT_MS, COLD_START_TIMEOUT_MS, preloadLazyRoutes } from '@/test/coldStart';
import { mockK8s } from '@/test/handlers';
import { renderApp } from '@/test/render';
import { server } from '@/test/server';
import { resourceRoutes } from '../routes';
import { NO_EVENTS } from './EventStreamView';

const PROXY = '*/api/clusters/:cluster/k8s/*';
const CRASHING_POD = 'web-7d4b9c8f6d-tq5wn';
const BACKOFF = `Back-off restarting failed container web in pod ${CRASHING_POD}`;
const EVENTS_PATH = '/c/dev-1/k8s/ns/shop/events';

beforeAll(() => preloadLazyRoutes(resourceRoutes));

beforeEach(() => {
  onTestFinished(
    setWatchTimingForTests({ flushMs: 10, initialBackoffMs: 20, maxBackoffMs: 40, minStreamMs: 100 }),
  );
});

/** The stream's event messages, top to bottom. */
function messages(): string[] {
  const stream = screen.queryByRole('list', { name: 'Events' });
  return stream ? within(stream).getAllByRole('group').map((message) => message.textContent) : [];
}

/** A new Normal event about a ConfigMap in `shop`, now. */
function liveEvent(name: string, message: string): K8sResource {
  return {
    apiVersion: 'v1',
    kind: 'Event',
    metadata: { name, namespace: 'shop', uid: `uid-${name}` },
    involvedObject: { apiVersion: 'v1', kind: 'ConfigMap', name: 'web-config', namespace: 'shop' },
    type: 'Normal',
    reason: 'Updated',
    message,
    source: { component: 'kubectl' },
    lastTimestamp: new Date().toISOString(),
  } as K8sResource;
}

describe('Events page as the OCP event stream (T-0124)', () => {
  it(
    'shows the toolbar, the streaming header and one card per event, newest first',
    async () => {
      renderApp(EVENTS_PATH);

      const stream = await screen.findByRole('list', { name: 'Events' }, { timeout: COLD_START_TIMEOUT_MS });
      expect(screen.getByRole('heading', { name: 'Events', level: 1 })).toBeInTheDocument();
      expect(screen.getByRole('combobox', { name: 'Resources' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Event type' })).toHaveTextContent('All types');
      expect(screen.getByRole('textbox', { name: 'Filter Events by name or message...' })).toBeInTheDocument();
      expect(screen.getByText('Streaming events...')).toBeInTheDocument();
      expect(screen.getByText('Showing 4 events')).toBeInTheDocument();
      // No table, kebab or pagination.
      expect(screen.queryByRole('grid')).not.toBeInTheDocument();

      expect(messages()[0]).toBe(BACKOFF);
      const [first] = within(stream).getAllByRole('listitem');
      if (!first) throw new Error('no card');
      expect(within(first).getByRole('link', { name: CRASHING_POD })).toHaveAttribute(
        'href',
        `/c/dev-1/k8s/ns/shop/pods/${CRASHING_POD}`,
      );
      expect(within(first).getByRole('link', { name: 'shop' })).toBeInTheDocument();
      expect(within(first).getByText('Generated from kubelet on worker-1')).toBeInTheDocument();
      expect(within(first).getByText(/^\d+ times in the last \d+ minutes?$/)).toBeInTheDocument();
      expect(within(first).getByText('2 minutes ago')).toBeInTheDocument();
    },
    COLD_START_TEST_TIMEOUT_MS,
  );

  it('narrows the stream by type, kind and text', async () => {
    const { user } = renderApp(EVENTS_PATH);
    await screen.findByRole('list', { name: 'Events' });

    await user.click(screen.getByRole('button', { name: 'Event type' }));
    await user.click(await screen.findByRole('option', { name: 'Warning' }));
    await waitFor(() => expect(messages()).toEqual([BACKOFF]));

    await user.click(screen.getByRole('button', { name: 'Event type' }));
    await user.click(await screen.findByRole('option', { name: 'Normal' }));
    await waitFor(() => expect(messages()).toHaveLength(3));

    await user.click(screen.getByRole('combobox', { name: 'Resources' }));
    await user.click(await screen.findByRole('checkbox', { name: /Deployment$/ }));
    expect(await screen.findByText('No matching events')).toBeInTheDocument();
    expect(screen.getByText('4 events exist, but none match the current filter')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Clear resource filter/ }));
    await waitFor(() => expect(messages()).toHaveLength(3));

    await user.type(screen.getByRole('textbox', { name: 'Filter Events by name or message...' }), '8mzrt');
    await waitFor(() => expect(messages()).toEqual(['Started container web']));
    expect(screen.getByText('Showing 1 event')).toBeInTheDocument();
  });

  it('stops new cards while paused and resumes on play', async () => {
    const { user } = renderApp(EVENTS_PATH);
    await screen.findByRole('list', { name: 'Events' });

    await user.click(screen.getByRole('button', { name: 'Pause event streaming' }));
    expect(screen.getByText('Event stream is paused.')).toBeInTheDocument();
    mockK8s.upsert('dev-1', liveEvent('paused-1', 'Updated while paused'));
    // Give the watch time to deliver it; the paused stream must not show it.
    await delay(200);
    expect(messages()).not.toContain('Updated while paused');

    await user.click(screen.getByRole('button', { name: 'Start streaming events' }));
    expect(screen.getByText('Streaming events...')).toBeInTheDocument();
    await waitFor(() => expect(messages()[0]).toBe('Updated while paused'));

    mockK8s.upsert('dev-1', liveEvent('live-2', 'Updated while streaming'));
    await waitFor(() => expect(messages()[0]).toBe('Updated while streaming'));
    expect(screen.getByText('Showing 6 events')).toBeInTheDocument();
  });

  it('shows the loading header while the first list loads', async () => {
    server.use(
      http.get(PROXY, async ({ request }) => {
        if (new URL(request.url).pathname.endsWith('/events')) {
          await delay('infinite');
          return HttpResponse.json({});
        }
        return undefined;
      }),
    );
    renderApp(EVENTS_PATH);

    expect(await screen.findByText('Loading events...')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Loading events' })).toBeInTheDocument();
  });

  it('says "No events" in an empty namespace', async () => {
    renderApp('/c/dev-1/k8s/ns/empty/events');

    expect(await screen.findByText(NO_EVENTS)).toBeInTheDocument();
    expect(screen.getByText('Showing 0 events')).toBeInTheDocument();
  });
});
