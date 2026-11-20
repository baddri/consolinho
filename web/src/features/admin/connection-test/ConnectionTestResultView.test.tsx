import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ConnectionTestResult } from '@/shared/api';
import {
  connectionTestPassed,
  connectionTestTlsFailure,
  connectionTestWithNamespaceRules,
} from '@/test/handlers';
import { ConnectionTestResultView } from './ConnectionTestResultView';

/** `[icon name, text]` of every step, in rendered order. */
function stepsOf(): [string, string][] {
  const list = screen.getByRole('list', { name: 'Test steps' });
  return within(list)
    .getAllByRole('listitem')
    .map((item) => [within(item).getByRole('img').getAttribute('aria-label') ?? '', item.textContent]);
}

describe('ConnectionTestResultView (T-0038)', () => {
  it('TEST-2: the TLS failure shows all steps in order with icons and the verbatim message', () => {
    render(<ConnectionTestResultView result={connectionTestTlsFailure} />);
    expect(screen.getByText(/^Connection test failed in 87 ms$/)).toBeInTheDocument();
    expect(stepsOf()).toEqual([
      ['Failed', 'Reachability: Certificate signed by unknown authority — add the cluster CA bundle'],
      ['Skipped', 'Authentication: Skipped because an earlier step failed'],
      ['Skipped', 'Identity: Skipped because an earlier step failed'],
      ['Skipped', 'OpenShift version: Skipped because an earlier step failed'],
      ['Skipped', 'Capabilities: Skipped because an earlier step failed'],
    ]);
    expect(screen.queryByRole('region', { name: 'Read capabilities' })).not.toBeInTheDocument();
  });

  it('TEST-2/3: a passing result shows the warning step, facts, headline and grouped capabilities', () => {
    render(<ConnectionTestResultView result={connectionTestPassed} />);
    expect(screen.getByText('Connection test passed in 412 ms')).toBeInTheDocument();
    expect(stepsOf().map(([icon]) => icon)).toEqual(['Passed', 'Passed', 'Passed', 'Warning', 'Passed']);
    const facts = screen.getByLabelText('Cluster facts', { selector: 'dl' });
    expect(facts).toHaveTextContent('Kubernetes versionv1.31.4');
    expect(facts).toHaveTextContent('system:serviceaccount:fleetconsole:fleet-view');
    expect(facts).not.toHaveTextContent('(from token)');
    expect(facts).toHaveTextContent('OpenShift versionUnknown');
    expect(screen.getByRole('heading', { name: /Capabilities/ })).toHaveTextContent('Cluster-wide view');

    const read = screen.getByRole('region', { name: 'Read capabilities' });
    const write = screen.getByRole('region', { name: 'Write capabilities' });
    expect(within(read).getAllByRole('listitem')).toHaveLength(8);
    expect(within(read).getAllByRole('img', { name: 'allowed' })).toHaveLength(7);
    expect(within(read).getByRole('img', { name: 'not allowed' }).closest('li')).toHaveTextContent('List secrets');
    expect(within(write).getAllByRole('img', { name: 'not allowed' })).toHaveLength(4);
  });

  it('TEST-3: an unknown check id, a token-subject identity and an update in progress render as received', () => {
    const result: ConnectionTestResult = {
      ...connectionTestPassed,
      identity: { username: 'system:serviceaccount:ops:robot', source: 'tokenSubject' },
      openShiftVersion: { version: '4.19.0', updateProgressing: true },
      capabilities: {
        headline: 'clusterAdmin',
        checks: [{ id: 'list-widgets', label: 'List widgets', category: 'write', allowed: true }],
      },
    };
    render(<ConnectionTestResultView result={result} />);
    const write = screen.getByRole('region', { name: 'Write capabilities' });
    expect(within(write).getByText('List widgets')).toBeInTheDocument();
    expect(within(write).getByRole('img', { name: 'allowed' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Read capabilities' })).not.toBeInTheDocument();
    const facts = screen.getByLabelText('Cluster facts', { selector: 'dl' });
    expect(facts).toHaveTextContent('system:serviceaccount:ops:robot (from token)');
    expect(within(facts).getByText('Update in progress')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Capabilities/ })).toHaveTextContent('Cluster admin');
  });

  it('TEST-4: hints render as inline alerts with their severity', () => {
    render(
      <ConnectionTestResultView
        result={{
          ...connectionTestPassed,
          hints: [
            { severity: 'warning', message: '2 users have read-write access but this credential cannot write.' },
            { severity: 'info', message: 'This credential can read secrets.' },
          ],
        }}
      />,
    );
    expect(screen.getByText('Warning alert:')).toBeInTheDocument();
    expect(screen.getByText('2 users have read-write access but this credential cannot write.')).toBeInTheDocument();
    expect(screen.getByText('Info alert:')).toBeInTheDocument();
    expect(screen.getByText('This credential can read secrets.')).toBeInTheDocument();
  });

  it('TEST-3 inspect: namespace rules expand into a table; incomplete lists and evaluation errors warn', async () => {
    const user = userEvent.setup();
    const rules = connectionTestWithNamespaceRules.namespaceRules;
    if (!rules) throw new Error('fixture without rules');
    render(
      <ConnectionTestResultView
        result={{
          ...connectionTestWithNamespaceRules,
          namespaceRules: { ...rules, incomplete: true, evaluationError: 'webhook authorizer timed out' },
        }}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Rules in namespace payments' }));
    const table = screen.getByRole('grid', { name: 'Rules in namespace payments' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent('get, list, watchcore, appspods, pods/log, deployments, replicasets, eventsAll');
    expect(screen.getByText('The cluster reported an incomplete rule list.')).toBeInTheDocument();
    expect(screen.getByText('webhook authorizer timed out')).toBeInTheDocument();
  });
});
