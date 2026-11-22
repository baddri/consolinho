import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { KindBadge, kindAbbr } from './kind-badge/KindBadge';
import { Status, statusKindOf } from './Status';

describe('statusKindOf (OCP Status.tsx, UX.md §5)', () => {
  it.each([
    ['Running', 'progress'],
    ['Updating', 'progress'],
    ['Pending', 'pending'],
    ['ContainerCreating', 'pending'],
    ['CrashLoopBackOff', 'danger'],
    ['Error', 'danger'],
    ['ImagePullBackOff', 'danger'],
    ['Active', 'success'],
    ['Ready', 'success'],
    ['Succeeded', 'success'],
    ['Completed', 'success'],
    ['Terminating', 'ban'],
    ['Not Ready', 'ban'],
    ['Warning', 'warning'],
    ['Unknown', 'unknown'],
    ['1 of 3 pods', 'neutral'],
  ] as const)('maps %s to %s', (status, kind) => {
    expect(statusKindOf(status)).toBe(kind);
  });

  it('renders the icon hidden from assistive technology next to the text', () => {
    render(<Status status="Terminating" />);
    expect(screen.getByText('Terminating').parentElement?.querySelector('svg')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
  });

  it('renders "—" for an empty status', () => {
    render(<Status status="" />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});

describe('KindBadge (OCP co-m-resource-icon)', () => {
  it.each([
    ['ConfigMap', 'CM'],
    ['ReplicaSet', 'RS'],
    ['Pod', 'P'],
    ['cluster', 'CLUS'],
  ])('abbreviates %s as %s', (kind, abbr) => {
    expect(kindAbbr(kind)).toBe(abbr);
  });

  it('shows the abbreviation with the kind as hover title, hidden from assistive technology', () => {
    render(<KindBadge kind="Pod" abbr="P" />);
    const badge = screen.getByTitle('Pod');
    expect(badge).toHaveTextContent('P');
    expect(badge).toHaveAttribute('aria-hidden', 'true');
  });
});
