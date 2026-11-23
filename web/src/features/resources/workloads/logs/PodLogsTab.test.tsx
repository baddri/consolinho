import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { PodModel, type K8sResource, type Pod } from '@/shared/k8s';
import { COLD_START_TEST_TIMEOUT_MS, COLD_START_TIMEOUT_MS, preloadLazyRoutes } from '@/test/coldStart';
import { mockK8s } from '@/test/handlers';
import { stubLogViewerLayout } from '@/test/logViewer';
import { renderApp } from '@/test/render';
import { server } from '@/test/server';
import { resourceRoutes } from '../../routes';

/** Running pods of the `web` deployment: one never restarted, one restarted once. */
const FRESH_POD = 'web-7d4b9c8f6d-2xkqp';
const RESTARTED_POD = 'web-7d4b9c8f6d-8mzrt';
const logsPath = (pod: string) => `/c/dev-1/k8s/ns/shop/pods/${pod}/logs`;
const LOG_PROXY = '*/api/clusters/:cluster/k8s/api/v1/namespaces/:namespace/pods/:pod/log';
const LOG_PATH = (pod: string) => `/api/clusters/dev-1/k8s/api/v1/namespaces/shop/pods/${pod}/log`;

beforeAll(() => preloadLazyRoutes(resourceRoutes));
beforeEach(stubLogViewerLayout);

/** Waits until the log streams (the play/pause control shows "pause"). */
async function streaming(): Promise<void> {
  expect(
    await screen.findByRole('button', { name: 'Pause event streaming' }, { timeout: COLD_START_TIMEOUT_MS }),
  ).toBeInTheDocument();
}

/** Replaces the `web` container's state of a stored pod. */
function setContainerState(pod: string, state: NonNullable<Pod['status']>['containerStatuses']): void {
  const stored = mockK8s.get('dev-1', PodModel, 'shop', pod) as Pod;
  mockK8s.upsert('dev-1', {
    ...stored,
    status: { ...stored.status, containerStatuses: state },
  } as K8sResource);
}

function webStatus(pod: string): NonNullable<NonNullable<Pod['status']>['containerStatuses']>[number] {
  const stored = mockK8s.get('dev-1', PodModel, 'shop', pod) as Pod;
  const status = stored.status?.containerStatuses?.[0];
  if (!status) throw new Error(`no container status on ${pod}`);
  return status;
}

describe('PodLogsTab', () => {
  it(
    'renders the OCP toolbar, banner and options (LOG-2)',
    async () => {
      const { user } = renderApp(logsPath(RESTARTED_POD));
      await streaming();
      expect(screen.getByRole('button', { name: 'Container web' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Log type' })).toHaveTextContent('Current log');
      expect(screen.getByRole('textbox', { name: 'Search logs' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'View raw logs' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Download' })).toBeInTheDocument();
      expect(await screen.findByText('10 lines')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Options' }));
      expect(screen.getByRole('checkbox', { name: 'Show full log' })).not.toBeChecked();
      await user.click(screen.getByRole('checkbox', { name: 'Wrap lines' }));
      expect(localStorage.getItem('fleetconsole.logs.wrapLines')).toBe('true');
      expect(screen.getByRole('checkbox', { name: 'Wrap lines' })).toBeChecked();
      // jsdom has no Fullscreen API: OCP hides "Expand" then.
      expect(screen.queryByRole('button', { name: 'Expand' })).not.toBeInTheDocument();
    },
    COLD_START_TEST_TIMEOUT_MS,
  );

  it(
    'expands the log to full screen and follows Esc leaving it (LOG-2)',
    async () => {
      let element: Element | null = null;
      const change = () => document.dispatchEvent(new Event('fullscreenchange'));
      Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: true });
      Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => element });
      Object.defineProperty(document, 'exitFullscreen', {
        configurable: true,
        value: () => {
          element = null;
          change();
          return Promise.resolve();
        },
      });
      const enter = (target: Element) => {
        element = target;
        change();
        return Promise.resolve();
      };
      const request = vi.fn(function (this: Element) {
        return enter(this);
      });
      Object.defineProperty(Element.prototype, 'requestFullscreen', { configurable: true, value: request });
      onTestFinished(() => {
        for (const prop of ['fullscreenEnabled', 'fullscreenElement', 'exitFullscreen']) {
          Reflect.deleteProperty(document, prop);
        }
        Reflect.deleteProperty(Element.prototype, 'requestFullscreen');
      });

      const { user } = renderApp(logsPath(RESTARTED_POD));
      await streaming();
      mockK8s.appendLog('dev-1', 'shop', RESTARTED_POD, 'web', 'marker line');
      const main = (await screen.findByText('marker line')).closest<HTMLElement>('.pf-v6-c-log-viewer__main');
      if (!main) throw new Error('no log viewer main');
      // The space the viewer gets. The browser settles the layout after React re-rendered for `fullscreenchange`, so
      // a render-time read still sees the old height; only a later re-measure sees the new one.
      let space = 800;
      Object.defineProperty(main, 'clientHeight', { configurable: true, get: () => space });
      /** The height react-window was given, i.e. what the viewer last measured. */
      const listHeight = async () =>
        (await screen.findByText('marker line')).closest<HTMLElement>('.pf-v6-c-log-viewer__scroll-container')
          ?.style.height;

      await user.click(screen.getByRole('button', { name: 'Expand' }));
      await waitFor(async () => expect(await listHeight()).toBe('800px'));
      // The wrapper holding toolbar and viewer goes full screen, not a fixed overlay trapped by an ancestor.
      expect(element).not.toBeNull();
      expect(element).toContainElement(screen.getByRole('button', { name: 'Collapse' }));
      expect(element).toContainElement(main);

      // Esc: the browser leaves full screen itself and fires `fullscreenchange`.
      act(() => {
        element = null;
        change();
      });
      expect(screen.getByRole('button', { name: 'Expand' })).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Expand' }));
      await user.click(screen.getByRole('button', { name: 'Collapse' }));
      space = 300;
      expect(element).toBeNull();
      // The viewer re-measured after collapse instead of keeping the full screen height (U1a).
      await waitFor(async () => expect(await listHeight()).toBe('300px'));
      expect(request).toHaveBeenCalledTimes(2);
    },
    COLD_START_TEST_TIMEOUT_MS,
  );

  it(
    'disables Previous log with OCP tooltip without restarts (LOG-5)',
    async () => {
      const { user } = renderApp(logsPath(FRESH_POD));
      await streaming();
      const logType = screen.getByRole('button', { name: 'Log type' });
      expect(logType).toBeDisabled();
      await user.hover(logType.parentElement ?? logType);
      expect(
        await screen.findByText('Only the current log is available for this container.'),
      ).toBeInTheDocument();
    },
    COLD_START_TEST_TIMEOUT_MS,
  );

  it(
    'shows the previous log of a restarted container, and links Raw/Download to it (LOG-5, LOG-9)',
    async () => {
      const { user } = renderApp(logsPath(RESTARTED_POD));
      await streaming();
      await user.click(screen.getByRole('button', { name: 'Log type' }));
      await user.click(screen.getByRole('option', { name: 'Previous log' }));
      expect(await screen.findByText('panic: database unavailable')).toBeInTheDocument();
      expect(screen.getByText('4 lines - Log stream ended.')).toBeInTheDocument();
      expect(screen.getByText('Log stream ended.')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Download' })).toHaveAttribute(
        'href',
        `${LOG_PATH(RESTARTED_POD)}?container=web&previous=true`,
      );
    },
    COLD_START_TEST_TIMEOUT_MS,
  );

  it(
    'points Download and View raw logs at the plain log of the container (LOG-9)',
    async () => {
      renderApp(logsPath(RESTARTED_POD));
      await streaming();
      const href = `${LOG_PATH(RESTARTED_POD)}?container=web`;
      const raw = screen.getByRole('link', { name: 'View raw logs' });
      expect(raw).toHaveAttribute('href', href);
      expect(raw).toHaveAttribute('target', '_blank');
      expect(raw).toHaveAttribute('rel', 'noopener noreferrer');
      const download = screen.getByRole('link', { name: 'Download' });
      expect(download).toHaveAttribute('href', href);
      expect(download).toHaveAttribute('download', `${RESTARTED_POD}-web.log`);
    },
    COLD_START_TEST_TIMEOUT_MS,
  );

  it(
    'pauses when scrolled up and resumes at the end with the new lines (LOG-7/8)',
    async () => {
      const { user } = renderApp(logsPath(RESTARTED_POD));
      await streaming();
      mockK8s.appendLog('dev-1', 'shop', RESTARTED_POD, 'web', 'marker line');
      const row = await screen.findByText('marker line');
      const scroller = row.closest<HTMLElement>('.pf-v6-c-log-viewer__scroll-container');
      if (!scroller) throw new Error('no scroll container');
      Object.defineProperty(scroller, 'scrollHeight', { configurable: true, value: 1000 });

      fireEvent.scroll(scroller, { target: { scrollTop: 600 } });
      fireEvent.scroll(scroller, { target: { scrollTop: 200 } });
      expect(await screen.findByRole('button', { name: 'Start streaming events' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Resume stream' })).toBeInTheDocument();

      mockK8s.appendLog('dev-1', 'shop', RESTARTED_POD, 'web', 'new 1', 'new 2');
      const resume = await screen.findByRole('button', { name: 'Resume stream and show 2 new lines' });
      expect(screen.queryByText('new 1')).not.toBeInTheDocument();
      await user.click(resume);
      await streaming();
      expect(await screen.findByText('new 2')).toBeInTheDocument();
      await waitFor(() => expect(scroller.scrollTop).toBe(1000));
    },
    COLD_START_TEST_TIMEOUT_MS,
  );

  it(
    'shows OCP error alert with the cluster message on 403 (LOG-10)',
    async () => {
      server.use(
        http.get(LOG_PROXY, () =>
          HttpResponse.json(
            {
              kind: 'Status',
              apiVersion: 'v1',
              status: 'Failure',
              reason: 'Forbidden',
              code: 403,
              message: 'pods "web" is forbidden: cannot get resource "pods/log"',
            },
            { status: 403 },
          ),
        ),
      );
      renderApp(logsPath(RESTARTED_POD));
      expect(
        await screen.findByText(
          'An error occurred while retrieving the requested logs.',
          {},
          { timeout: COLD_START_TIMEOUT_MS },
        ),
      ).toBeInTheDocument();
      expect(screen.getByText(/cannot get resource "pods\/log"/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    },
    COLD_START_TEST_TIMEOUT_MS,
  );

  it(
    'shows an info alert while the container waits to start, then streams once it runs (LOG-10)',
    async () => {
      const running = webStatus(FRESH_POD);
      setContainerState(FRESH_POD, [
        { ...running, ready: false, state: { waiting: { reason: 'ContainerCreating' } } },
      ]);
      renderApp(logsPath(FRESH_POD));
      expect(
        await screen.findByText(
          /is waiting to start: ContainerCreating/,
          {},
          { timeout: COLD_START_TIMEOUT_MS },
        ),
      ).toBeInTheDocument();
      expect(
        screen.queryByText('An error occurred while retrieving the requested logs.'),
      ).not.toBeInTheDocument();

      act(() => setContainerState(FRESH_POD, [running]));
      await streaming();
      expect(screen.queryByText(/is waiting to start/)).not.toBeInTheDocument();
    },
    COLD_START_TEST_TIMEOUT_MS,
  );

  it(
    'shows 0 lines for an empty log (LOG-10)',
    async () => {
      const running = webStatus(FRESH_POD);
      setContainerState(FRESH_POD, [
        {
          ...running,
          ready: false,
          state: {
            terminated: {
              exitCode: 0,
              reason: 'Completed',
              startedAt: '2026-11-23T10:00:00Z',
              finishedAt: '2026-11-23T10:01:00Z',
            },
          },
        },
      ]);
      server.use(http.get(LOG_PROXY, () => new HttpResponse('', { status: 200 })));
      renderApp(logsPath(FRESH_POD));
      expect(
        await screen.findByText('0 lines - Log stream ended.', {}, { timeout: COLD_START_TIMEOUT_MS }),
      ).toBeInTheDocument();
    },
    COLD_START_TEST_TIMEOUT_MS,
  );
});
