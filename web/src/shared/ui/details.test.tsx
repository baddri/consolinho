import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { DetailsSubsection, ResourceLabels, Timestamp, timestampText, utcTimestampText } from '.';

const NOW = new Date('2026-11-17T21:54:00Z');
const at = (offsetMs: number) => new Date(NOW.getTime() + offsetMs);
const SECOND = 1000;
const MINUTE = 60 * SECOND;

describe('timestampText (OCP timestampFor)', () => {
  it.each([
    [0, 'Just now'],
    [-30 * SECOND, 'Just now'],
    // Up to a minute ahead is clock drift.
    [30 * SECOND, 'Just now'],
    [-MINUTE, '1 minute ago'],
    [-5 * MINUTE, '5 minutes ago'],
    [-(10 * MINUTE + 29 * SECOND), '10 minutes ago'],
  ])('shows a time %i ms away relative: "%s"', (offset, expected) => {
    expect(timestampText(at(offset), NOW)).toBe(expected);
  });

  it('shows the absolute date and time from 10.5 minutes ago and in the future', () => {
    const absolute = new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
    });
    for (const offset of [-(10 * MINUTE + 30 * SECOND), -3 * 24 * 60 * MINUTE, 2 * MINUTE])
      expect(timestampText(at(offset), NOW)).toBe(absolute.format(at(offset)));
  });

  it('formats the tooltip in UTC with the zone name', () => {
    expect(utcTimestampText(NOW)).toMatch(/2026.*9:54.*UTC/);
  });
});

describe('Timestamp', () => {
  it('renders a clock icon and a <time> with the UTC time in a tooltip', async () => {
    const value = '2026-01-02T03:04:00Z';
    const { container } = render(<Timestamp value={value} />);
    const time = container.querySelector('time');
    expect(time).toHaveAttribute('dateTime', value);
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');

    await userEvent.hover(time as HTMLElement);
    expect(await screen.findByRole('tooltip')).toHaveTextContent(utcTimestampText(new Date(value)));
  });

  it('ticks while relative and runs no timer for an old (absolute) time', () => {
    vi.useFakeTimers();
    try {
      // Baseline: other timers (tooltip) of an absolute timestamp; a relative one adds exactly its tick.
      const old = render(<Timestamp value="2020-01-02T03:04:00Z" />);
      const absoluteTimers = vi.getTimerCount();
      old.unmount();

      render(<Timestamp value={new Date(Date.now() - 30 * SECOND).toISOString()} />);
      expect(screen.getByText('Just now')).toBeInTheDocument();
      expect(vi.getTimerCount()).toBe(absoluteTimers + 1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows "-" without a value and an unparseable value as received', () => {
    const { rerender } = render(<Timestamp value={undefined} />);
    expect(screen.getByText('-')).toBeInTheDocument();
    rerender(<Timestamp value="yesterday" />);
    expect(screen.getByText('yesterday')).toBeInTheDocument();
  });
});

describe('DetailsSubsection', () => {
  it('is a region named by its h2', () => {
    render(
      <DetailsSubsection title="Containers">
        <p>table</p>
      </DetailsSubsection>,
    );
    const region = screen.getByRole('region', { name: 'Containers' });
    expect(within(region).getByRole('heading', { level: 2, name: 'Containers' })).toBeInTheDocument();
    expect(within(region).getByText('table')).toBeInTheDocument();
  });
});

describe('ResourceLabels', () => {
  it('renders coloured key=value labels linking where linkTo points', () => {
    render(
      <MemoryRouter>
        <ResourceLabels
          labels={{ app: 'web', tier: 'front' }}
          color="teal"
          linkTo={(key, value) => `/pods?label=${key}%3D${value}`}
        />
      </MemoryRouter>,
    );
    const link = screen.getByRole('link', { name: 'app=web' });
    expect(link).toHaveAttribute('href', '/pods?label=app%3Dweb');
    expect(link.closest('.pf-v6-c-label')).toHaveClass('pf-m-teal');
    expect(screen.getByRole('link', { name: 'tier=front' })).toBeInTheDocument();
  });

  it('says "No labels" without any', () => {
    render(<ResourceLabels labels={{}} />);
    expect(screen.getByText('No labels')).toHaveClass('pf-v6-u-text-color-subtle');
  });
});
