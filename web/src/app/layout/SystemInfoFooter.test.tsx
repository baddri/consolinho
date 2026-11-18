import { screen } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { server } from '@/test/server';
import { renderWithProviders } from '@/test/render';
import { SystemInfoFooter } from './SystemInfoFooter';

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
    expect(await screen.findByText('FleetConsole 9.9.9 · Slow')).toBeInTheDocument();
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
