import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import {
  DetailsColumn,
  DetailsItem,
  DetailsSubsection,
  FieldHelpContext,
  ResourceLabels,
  Timestamp,
  timestampText,
  utcTimestampText,
  type FieldHelp,
} from '.';

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
    expect(link.closest('.pf-v6-c-label')).toHaveClass('pf-m-teal', 'pf-m-clickable');
    expect(screen.getByRole('link', { name: 'tier=front' })).toBeInTheDocument();
  });

  it('drops the box with isBoxed false (list cells) and is not clickable without links', () => {
    const { container } = render(<ResourceLabels labels={{ app: 'web' }} isBoxed={false} />);
    expect(container.firstElementChild).toHaveClass('pf-v6-c-label-group');
    expect(screen.getByText('app=web').closest('.pf-v6-c-label')).not.toHaveClass('pf-m-clickable');
  });

  it('says "No labels" without any', () => {
    render(<ResourceLabels labels={{}} />);
    expect(screen.getByText('No labels')).toHaveClass('pf-v6-u-text-color-subtle');
  });
});

describe('DetailsItem field help (HELP-1)', () => {
  const help: FieldHelp = {
    kindLabel: 'Deployment',
    describe: (path) => (path === 'spec.replicas' ? 'Number of desired pods.' : undefined),
  };

  function renderItem(value: FieldHelp | null, path?: string) {
    return render(
      <FieldHelpContext value={value}>
        <DetailsColumn>
          <DetailsItem label="Replicas" path={path}>
            3
          </DetailsItem>
        </DetailsColumn>
      </FieldHelpContext>,
    );
  }

  it('renders a described path as a popover term with the description and the path breadcrumb', async () => {
    renderItem(help, 'spec.replicas');

    await userEvent.click(screen.getByRole('button', { name: 'Replicas' }));

    const popover = await screen.findByRole('dialog');
    expect(within(popover).getByRole('region', { name: 'Replicas' })).toHaveTextContent(
      'Number of desired pods.',
    );
    const crumbs = within(within(popover).getByRole('navigation')).getAllByRole('listitem');
    expect(crumbs.map((item) => item.textContent)).toEqual(['Deployment', 'spec', 'replicas']);
  });

  it("links the description's URLs to a new tab and keeps its line breaks (OCP LinkifyExternal, co-pre-line)", async () => {
    const url = 'https://kubernetes.io/docs/concepts/overview/working-with-objects/names#uids';
    renderItem({ ...help, describe: () => `Unique id.\n\nMore info: ${url}.` }, 'spec.replicas');

    await userEvent.click(screen.getByRole('button', { name: 'Replicas' }));

    const region = within(await screen.findByRole('dialog')).getByRole('region', { name: 'Replicas' });
    const link = within(region).getByRole('link', { name: url });
    expect(link).toHaveAttribute('href', url);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    // The text before the link keeps its newlines; the trailing full stop is not part of the URL.
    expect(region.textContent).toBe(`Unique id.\n\nMore info: ${url}.`);
  });

  it.each([
    ['no provider', null, 'spec.replicas'],
    ['no path', help, undefined],
    ['no description', help, 'spec.paused'],
  ])('keeps a plain term with %s', (_case, value, path) => {
    renderItem(value, path);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText('Replicas').tagName).toBe('SPAN');
    expect(screen.getByText('Replicas').closest('dt')).not.toBeNull();
  });
});
