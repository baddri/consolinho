import { screen } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { server } from '@/test/server';
import { renderWithProviders } from '@/test/render';
import { SystemInfoFooter } from './SystemInfoFooter';

const LONG_VERSION = '1.0.0+dc5aff8da720c3d4249989d27d74a6aa9435ea6b';

describe('SystemInfoFooter', () => {
  it('shows a loading placeholder until the Api answers, then the version', async () => {
    server.use(
      http.get('*/api/system/info', async () => {
        await delay(50);
        return HttpResponse.json({ version: '9.9.9', environment: 'Slow' });
      }),
    );

    renderWithProviders(<SystemInfoFooter />);

    expect(await screen.findByText('Loading version information')).toBeInTheDocument();
    expect(await screen.findByText(/^Consolinho ·/)).toHaveTextContent('Consolinho 9.9.9 · Slow');
  });

  it('shortens a full commit SHA and shows the full version in a tooltip on hover', async () => {
    server.use(
      http.get('*/api/system/info', () =>
        HttpResponse.json({ version: LONG_VERSION, environment: 'Production' }),
      ),
    );

    const { user } = renderWithProviders(<SystemInfoFooter />);

    expect(await screen.findByText(/^Consolinho ·/)).toHaveTextContent(
      'Consolinho 1.0.0+dc5aff8 · Production',
    );
    expect(screen.queryByText(LONG_VERSION, { exact: false })).not.toBeInTheDocument();

    await user.hover(screen.getByText('1.0.0+dc5aff8'));

    expect(await screen.findByRole('tooltip')).toHaveTextContent(`Version ${LONG_VERSION}`);
  });

  it('makes the full version reachable by keyboard and describes the label with it', async () => {
    server.use(
      http.get('*/api/system/info', () =>
        HttpResponse.json({ version: LONG_VERSION, environment: 'Production' }),
      ),
    );

    const { user } = renderWithProviders(<SystemInfoFooter />);
    const label = await screen.findByText('1.0.0+dc5aff8');

    await user.tab();

    expect(label).toHaveFocus();
    expect(await screen.findByRole('tooltip')).toBeInTheDocument();
    expect(label).toHaveAccessibleDescription(`Version ${LONG_VERSION}`);
  });

  it('does not add a tooltip or tab stop when the version is already short', async () => {
    const { user } = renderWithProviders(<SystemInfoFooter />);
    const label = await screen.findByText('0.0.0-test');

    expect(label).not.toHaveAttribute('tabindex');
    await user.tab();
    expect(label).not.toHaveFocus();
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('falls back when the Api answers with a ProblemDetails error', async () => {
    server.use(
      http.get('*/api/system/info', () =>
        HttpResponse.json(
          { status: 503, title: 'Service Unavailable' },
          { status: 503, headers: { 'Content-Type': 'application/problem+json' } },
        ),
      ),
    );

    renderWithProviders(<SystemInfoFooter />);

    expect(await screen.findByText('Version information unavailable')).toBeInTheDocument();
  });

  it('falls back when the network fails', async () => {
    server.use(http.get('*/api/system/info', () => HttpResponse.error()));

    renderWithProviders(<SystemInfoFooter />);

    expect(await screen.findByText('Version information unavailable')).toBeInTheDocument();
  });
});
