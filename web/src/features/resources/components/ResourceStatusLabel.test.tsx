import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ResourceStatusLabel } from './ResourceStatusLabel';

describe('ResourceStatusLabel (UX.md §5)', () => {
  it('renders icon + text, not a filled label', () => {
    render(<ResourceStatusLabel status={{ title: 'Running' }} />);
    const text = screen.getByText('Running');
    // The icon is decorative (hidden from AT) and sits beside the text, not inside a label.
    const icon = text.parentElement?.querySelector('svg');
    expect(icon).toHaveAttribute('aria-hidden', 'true');
    expect(text.closest('[class*="label"]')).toBeNull();
  });

  it('renders a phrase OCP has no icon for as text only', () => {
    render(<ResourceStatusLabel status={{ title: '1 of 3 pods' }} />);
    expect(screen.getByText('1 of 3 pods').parentElement?.querySelector('svg')).toBeNull();
  });

  it('renders "-" without a status', () => {
    render(<ResourceStatusLabel status={undefined} />);
    expect(screen.getByText('-')).toBeInTheDocument();
  });
});
