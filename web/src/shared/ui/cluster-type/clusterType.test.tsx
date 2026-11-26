import { render, screen } from '@testing-library/react';
import { OpenshiftIcon } from '@patternfly/react-icons';
import { siKubernetes } from 'simple-icons';
import { ClusterTypeIcon, ClusterTypeLabel, clusterTypeText } from '@/shared/ui';

describe('cluster type pieces (UX.md §2a)', () => {
  it('names each distribution with a tag and a word (SW-3, SW-6, DIST-3)', () => {
    expect(clusterTypeText('openShift')).toEqual({ tag: 'OCP', word: 'OpenShift' });
    expect(clusterTypeText('kubernetes')).toEqual({ tag: 'K8s', word: 'Kubernetes' });
  });

  it('renders the tag as a compact, filled, default-grey label', () => {
    render(
      <>
        <ClusterTypeLabel distribution="openShift" />
        <ClusterTypeLabel distribution="kubernetes" />
      </>,
    );
    for (const tag of ['OCP', 'K8s']) {
      const label = screen.getByText(tag).closest('.pf-v6-c-label');
      expect(label).toHaveClass('pf-m-compact');
      expect(label).not.toHaveClass('pf-m-outline');
      expect(label?.className).not.toMatch(/pf-m-(blue|green|orange|red|purple|teal|yellow|orangered)/);
    }
  });

  it('uses a different, aria-hidden icon shape per distribution', () => {
    const { container: openShift } = render(<ClusterTypeIcon distribution="openShift" />);
    const { container: kubernetes } = render(<ClusterTypeIcon distribution="kubernetes" />);
    const ocpIcon = openShift.querySelector('svg');
    const k8sIcon = kubernetes.querySelector('svg');

    expect(ocpIcon).toHaveAttribute('aria-hidden', 'true');
    expect(k8sIcon).toHaveAttribute('aria-hidden', 'true');
    expect(ocpIcon?.innerHTML).not.toBe(k8sIcon?.innerHTML);
  });

  it('uses PatternFly OpenshiftIcon for OpenShift and the Kubernetes logo for Kubernetes (T-0203, T-0393)', () => {
    const { container: openShift } = render(<ClusterTypeIcon distribution="openShift" />);
    const { container: kubernetes } = render(<ClusterTypeIcon distribution="kubernetes" />);
    const { container: expectedOcp } = render(<OpenshiftIcon aria-hidden />);

    expect(openShift.innerHTML).toBe(expectedOcp.innerHTML);
    expect(kubernetes.querySelector('path')).toHaveAttribute('d', siKubernetes.path);
  });
});
