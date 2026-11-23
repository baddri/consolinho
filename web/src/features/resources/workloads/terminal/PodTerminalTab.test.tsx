import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ws } from 'msw';
import { useEffect, useImperativeHandle, useState, type Ref } from 'react';
import type { K8sResource, Pod } from '@/shared/k8s';
import type { XTermHandle, XTermProps } from '@/shared/ui/terminal';
import { COLD_START_TEST_TIMEOUT_MS, COLD_START_TIMEOUT_MS, preloadLazyRoutes } from '@/test/coldStart';
import { mockK8s, setMockUser } from '@/test/handlers';
import { renderApp } from '@/test/render';
import { server } from '@/test/server';
import { resourceRoutes } from '../../routes';

/**
 * xterm needs a real layout and canvas, so tests use a double with the same contract: it reports an 80x24 fit on
 * mount (TERM-9), forwards typing (Enter as `\r`) from a textbox and shows everything written to it as text.
 */
vi.mock('@/shared/ui/terminal', () => ({
  XTerm: function XTermDouble({ ref, onData, onResize, isInputDisabled }: XTermProps) {
    const [output, setOutput] = useState('');
    useImperativeHandle(ref as Ref<XTermHandle>, () => ({
      write: (data) =>
        setOutput((text) => text + (typeof data === 'string' ? data : new TextDecoder().decode(data))),
      focus: () => undefined,
      reset: () => setOutput(''),
    }));
    useEffect(() => onResize(80, 24), [onResize]);
    return (
      <>
        <pre data-testid="terminal-output">{output}</pre>
        <input
          aria-label="Terminal input"
          disabled={isInputDisabled}
          onChange={(event) => onData(event.target.value.slice(-1))}
          onKeyDown={(event) => {
            if (event.key === 'Enter') onData('\r');
          }}
        />
      </>
    );
  },
}));

const POD = 'web-7d4b9c8f6d-2xkqp';
const terminalPath = (pod: string, cluster = 'dev-1', query = '') =>
  `/c/${cluster}/k8s/ns/shop/pods/${pod}/terminal${query}`;
const EXEC_URL = '*/api/clusters/:cluster/k8s/api/v1/namespaces/:namespace/pods/:pod/exec';

const output = () => screen.getByTestId('terminal-output').textContent;

/** Counts exec upgrades the browser attempts (every matching `ws` link sees the connection). */
function countExecConnections(): { count: number } {
  const counter = { count: 0 };
  server.use(
    ws.link(EXEC_URL).addEventListener('connection', () => {
      counter.count += 1;
    }),
  );
  return counter;
}

/** A running pod in `shop` of dev-1 with the given containers; `notRunning` ones are waiting. */
function upsertPod(name: string, containers: string[], { notRunning = [] as string[], phase = 'Running' } = {}) {
  const pod: Pod & K8sResource = {
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: { name, namespace: 'shop', uid: `uid-${name}` },
    spec: { containers: containers.map((container) => ({ name: container, image: 'i' })) },
    status: {
      phase,
      containerStatuses: containers.map((container) => ({
        name: container,
        image: 'i',
        imageID: '',
        ready: !notRunning.includes(container),
        restartCount: 0,
        state: notRunning.includes(container) ? { waiting: { reason: 'CrashLoopBackOff' } } : { running: {} },
      })),
    },
  };
  mockK8s.upsert('dev-1', pod);
}

beforeAll(() => preloadLazyRoutes(resourceRoutes));

describe('pod terminal tab', () => {
  it(
    'connects to the container, echoes typed input and sends the fitted size (TERM-1, TERM-9)',
    async () => {
      const user = userEvent.setup();
      renderApp(terminalPath(POD));

      expect(await screen.findByText('Connecting to', {}, { timeout: COLD_START_TIMEOUT_MS })).toBeInTheDocument();
      const panel = screen.getByRole('tabpanel', { name: 'Terminal' });
      // A single container is a label, not a select (OCP `pod-connect.tsx`).
      expect(within(panel).getByText('web')).toBeInTheDocument();
      expect(within(panel).queryByRole('button', { name: /^Container/ })).not.toBeInTheDocument();

      await waitFor(() => expect(output()).toBe('$ '));
      await user.type(screen.getByRole('textbox', { name: 'Terminal input' }), 'ls');
      await waitFor(() => expect(output()).toBe('$ ls'));

      const [session] = mockK8s.execSessions();
      expect(session).toMatchObject({ pod: POD, container: 'web', stdin: 'ls' });
      expect(session?.resizes).toContainEqual([80, 24]);
    },
    COLD_START_TEST_TIMEOUT_MS,
  );

  it('honours ?container=, skips non-running containers and reconnects on a switch (TERM-2)', async () => {
    upsertPod('multi', ['web', 'sidecar', 'broken'], { notRunning: ['broken'] });
    const user = userEvent.setup();
    renderApp(terminalPath('multi', 'dev-1', '?container=sidecar'));

    await waitFor(() => expect(mockK8s.execSessions().map((s) => s.container)).toEqual(['sidecar']));
    const sidecarSession = mockK8s.execSessions()[0];

    await user.click(screen.getByRole('button', { name: 'Container sidecar' }));
    expect(screen.getByRole('option', { name: /broken/ })).toBeDisabled();
    await user.click(screen.getByRole('option', { name: /web/ }));

    await waitFor(() => expect(mockK8s.execSessions().map((s) => s.container)).toEqual(['web']));
    expect(mockK8s.execSessions()).not.toContain(sidecarSession);
  });

  it('shows the closed alert on a server close and reconnects (TERM-3)', async () => {
    const user = userEvent.setup();
    renderApp(terminalPath(POD));
    await waitFor(() => expect(mockK8s.execSessions()).toHaveLength(1));
    await waitFor(() => expect(output()).toBe('$ '));

    act(() => mockK8s.closeExec(1006));

    expect(await screen.findByText('The terminal connection has closed.')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Terminal input' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Reconnect' }));

    await waitFor(() => expect(mockK8s.execSessions()).toHaveLength(1));
    await waitFor(() => expect(screen.queryByText('The terminal connection has closed.')).not.toBeInTheDocument());
    expect(screen.getByRole('textbox', { name: 'Terminal input' })).toBeEnabled();
  });

  it("prints the cluster's message when the command fails (TERM-9)", async () => {
    server.use(
      ws.link(EXEC_URL).addEventListener('connection', ({ client }) => {
        const status = JSON.stringify({ status: 'Failure', message: 'executable file not found in $PATH' });
        client.send(`3${btoa(status)}`);
      }),
    );
    renderApp(terminalPath(POD));

    await waitFor(() => expect(output()).toContain('executable file not found in $PATH'));
  });

  it('shows the read-only copy and opens no socket for a read-only grant (TERM-4)', async () => {
    setMockUser('alice');
    const connections = countExecConnections();
    renderApp(terminalPath(POD, 'prod-eu-1'));

    expect(
      await screen.findByText('You have read-only access to prod-eu-1. The terminal is not available.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Connecting to')).not.toBeInTheDocument();
    expect(connections.count).toBe(0);
  });

  it('shows the RBAC reason and opens no socket without create pods/exec (TERM-4)', async () => {
    setMockUser('pending-paul');
    const connections = countExecConnections();
    renderApp(terminalPath(POD, 'prod-eu-1'));

    expect(
      await screen.findByText('The service account for prod-eu-1 cannot create pods/exec in shop (cluster RBAC).'),
    ).toBeInTheDocument();
    expect(connections.count).toBe(0);
  });

  it('shows an empty state and opens no socket for a pod that is not running (TERM-5)', async () => {
    upsertPod('pending', ['web'], { phase: 'Pending', notRunning: ['web'] });
    const connections = countExecConnections();
    renderApp(terminalPath('pending'));

    expect(await screen.findByText('Pod is not running')).toBeInTheDocument();
    expect(connections.count).toBe(0);
  });

  it('closes the socket when the user leaves the tab (TERM-10)', async () => {
    const user = userEvent.setup();
    renderApp(terminalPath(POD));
    await waitFor(() => expect(mockK8s.execSessions()).toHaveLength(1));

    await user.click(screen.getByRole('tab', { name: 'Details' }));

    await waitFor(() => expect(mockK8s.execSessions()).toHaveLength(0));
  });

  it('shows a loading state until the session opens (review 5)', async () => {
    renderApp(terminalPath(POD));

    // Found at all means it was shown: it is replaced as soon as the mock socket opens.
    await screen.findByRole('progressbar', { name: 'Connecting to the terminal' });
    await waitFor(() => expect(output()).toBe('$ '));
    expect(screen.queryByRole('progressbar', { name: 'Connecting to the terminal' })).not.toBeInTheDocument();
  });

  it('prints the Enter echo before the close message on exit (review 6)', async () => {
    const user = userEvent.setup();
    renderApp(terminalPath(POD));
    await waitFor(() => expect(output()).toBe('$ '));

    await user.type(screen.getByRole('textbox', { name: 'Terminal input' }), 'exit{Enter}');

    expect(await screen.findByText('The terminal connection has closed.')).toBeInTheDocument();
    expect(output()).toBe('$ exit\r\n\x1b[31mThe terminal connection has closed.\x1b[m\r\n');
  });

  describe('with full screen supported', () => {
    beforeEach(() => {
      Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: true });
    });
    afterEach(() => {
      Reflect.deleteProperty(document, 'fullscreenEnabled');
    });

    it('offers Expand on a connected terminal', async () => {
      renderApp(terminalPath(POD));
      await waitFor(() => expect(output()).toBe('$ '));
      expect(screen.getByRole('button', { name: 'Expand' })).toBeInTheDocument();
    });

    it('explains a single non-running container without "choose" and hides Expand (review 3)', async () => {
      upsertPod('crashing', ['web'], { notRunning: ['web'] });
      const connections = countExecConnections();
      renderApp(terminalPath('crashing'));

      expect(await screen.findByText('Container web is not running.')).toBeInTheDocument();
      expect(screen.queryByText(/Choose a running container/)).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Expand' })).not.toBeInTheDocument();
      expect(connections.count).toBe(0);
    });
  });
});
