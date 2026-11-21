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
    const { container } = render(<ResourceStatusLabel status={{ title: 'Running', color: 'green' }} />);
    expect(screen.getByText('Running')).toBeInTheDocument();
    expect(container.querySelector('.pf-v6-c-label')).toBeNull();
    expect(container.querySelector('.pf-v6-c-icon')).not.toBeNull();
  });

  it('renders an outlined label for a details title with asLabel', () => {
    const { container } = render(<ResourceStatusLabel status={{ title: 'Active', color: 'green' }} asLabel />);
    expect(container.querySelector('.pf-v6-c-label.pf-m-outline')).not.toBeNull();
  });
});
