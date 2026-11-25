import { render, screen } from '@testing-library/react';
import type { ConnectionTestSummary } from '@/shared/api';
import { LastTestLabel } from './LastTestLabel';

/** A stored summary of a test against a detected Kubernetes cluster (no OpenShift version step failed, CT-3). */
const kubernetesSummary: ConnectionTestSummary = {
  testedAt: new Date(Date.now() - 60_000).toISOString(),
  succeeded: true,
  failedStep: null,
  headline: 'clusterAdmin',
  isStale: false,
};

describe('LastTestLabel (CT-3)', () => {
  it('a passed Kubernetes summary shows only the headline, nothing OpenShift-only', () => {
    const { container } = render(<LastTestLabel lastTest={kubernetesSummary} />);
    expect(screen.getByText('Passed · Cluster admin')).toBeInTheDocument();
    expect(container).not.toHaveTextContent(/OpenShift/);
  });

  it('a failed Kubernetes summary names the failed step, never OpenShift', () => {
    const failed: ConnectionTestSummary = {
      ...kubernetesSummary,
      succeeded: false,
      failedStep: 'capabilities',
      headline: null,
    };
    const { container } = render(<LastTestLabel lastTest={failed} />);
    expect(screen.getByText('Failed at Capabilities')).toBeInTheDocument();
    expect(container).not.toHaveTextContent(/OpenShift/);
  });
});
