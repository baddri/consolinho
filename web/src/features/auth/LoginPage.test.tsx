import { screen } from '@testing-library/react';
import { renderApp } from '@/test/render';

/** Accessible name of a PatternFly alert title: screen-reader variant prefix directly followed by the title. */
const alertTitle = (variant: string, text: string) => `${variant} alert:${text}`;

describe('LoginPage', () => {
  it('shows one login button pointing at the Api login endpoint, and no message on a plain visit', async () => {
    renderApp('/login');

    expect(await screen.findByRole('heading', { name: 'Log in to FleetConsole' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Log in with OpenShift' })).toHaveAttribute(
      'href',
      '/api/auth/login?returnUrl=%2F',
    );
    expect(screen.queryByRole('heading', { name: /alert:/ })).not.toBeInTheDocument();
    expect(await screen.findByText('FleetConsole 0.0.0-test · Test')).toBeInTheDocument();
  });

  it('keeps a safe return URL and drops an unsafe one', async () => {
    const { unmount } = renderApp('/login?returnUrl=%2Fadmin%2Fusers%3Fq%3Dal');
    expect(await screen.findByRole('link', { name: 'Log in with OpenShift' })).toHaveAttribute(
      'href',
      '/api/auth/login?returnUrl=%2Fadmin%2Fusers%3Fq%3Dal',
    );
    unmount();

    renderApp('/login?returnUrl=https%3A%2F%2Fevil.example');
    expect(await screen.findByRole('link', { name: 'Log in with OpenShift' })).toHaveAttribute(
      'href',
      '/api/auth/login?returnUrl=%2F',
    );
  });

  it.each([
    ['loggedOut=1', 'Info', 'You have been logged out.'],
    ['reason=session_ended', 'Warning', 'Your session ended. Log in again to continue.'],
    [
      'error=not_registered&username=jdoe',
      'Danger',
      'Your OpenShift account jdoe is not registered in FleetConsole. Ask a FleetConsole administrator to add you.',
    ],
    [
      'error=not_registered',
      'Danger',
      'Your OpenShift account is not registered in FleetConsole. Ask a FleetConsole administrator to add you.',
    ],
    ['error=deactivated', 'Danger', 'Your FleetConsole account is deactivated.'],
    ['error=cancelled', 'Info', 'Login was cancelled.'],
    [
      'error=unavailable',
      'Danger',
      'OpenShift login is currently unavailable (host cluster OAuth server did not respond). Existing sessions are not affected.',
    ],
    ['error=failed', 'Danger', 'Login failed. Please try again.'],
    ['error=something_new', 'Danger', 'Login failed. Please try again.'],
    [
      'error=deactivated&loggedOut=1&reason=session_ended',
      'Danger',
      'Your FleetConsole account is deactivated.',
    ],
  ])('?%s shows the %s message (AUTH-6/7/10/11/14)', async (query, variant, text) => {
    renderApp(`/login?${query}&returnUrl=%2Fc%2Fdev-1%2Foverview`);

    expect(await screen.findByRole('heading', { name: alertTitle(variant, text) })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { name: /alert:/ })).toHaveLength(1);
    // A message never replaces the button, and the return URL survives the failed attempt.
    expect(screen.getByRole('link', { name: 'Log in with OpenShift' })).toHaveAttribute(
      'href',
      '/api/auth/login?returnUrl=%2Fc%2Fdev-1%2Foverview',
    );
  });

  it('renders the username from the URL as text, never as markup (AUTH-6)', async () => {
    const username = '<img src=x onerror=alert(1)>';
    renderApp(`/login?error=not_registered&username=${encodeURIComponent(username)}`);

    expect(
      await screen.findByRole('heading', {
        name: alertTitle(
          'Danger',
          `Your OpenShift account ${username} is not registered in FleetConsole. Ask a FleetConsole administrator to add you.`,
        ),
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(username)).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});
