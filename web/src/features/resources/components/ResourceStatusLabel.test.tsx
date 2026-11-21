import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ResourceStatusLabel, statusColor, toStatusKind } from './ResourceStatusLabel';

describe('ResourceStatusLabel (UX.md §5)', () => {
  it.each([
    ['Running', 'success'],
    ['CrashLoopBackOff', 'danger'],
    ['Pending', 'pending'],
    ['Terminating', 'neutral'],
  ] as const)('maps %s to %s', (title, kind) => {
    expect(toStatusKind(statusColor(title))).toBe(kind);
  });

  it('renders icon + text, not a filled label', () => {
    render(<ResourceStatusLabel status={{ title: 'Running', color: 'green' }} />);
    const text = screen.getByText('Running');
    // The icon is decorative (hidden from AT) and sits beside the text, not inside a label.
    const icon = text.parentElement?.querySelector('svg');
    expect(icon).toHaveAttribute('aria-hidden', 'true');
    expect(text.closest('[class*="label"]')).toBeNull();
  });

  it('renders no icon for a neutral status', () => {
    render(<ResourceStatusLabel status={{ title: 'Terminating', color: 'grey' }} />);
    expect(screen.getByText('Terminating').parentElement?.querySelector('svg')).toBeNull();
  });

  it('renders "—" without a status', () => {
    render(<ResourceStatusLabel status={undefined} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});
