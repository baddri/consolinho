import type { AlertProps } from '@patternfly/react-core';
import type { ReactNode } from 'react';
import { PRODUCT_NAME } from '@/shared/branding';

/** A message the login page shows above the login button. */
export interface LoginMessage {
  variant: NonNullable<AlertProps['variant']>;
  /** Rendered as React children, so values from the URL (e.g. `username`) are always escaped text. */
  text: ReactNode;
}

/** Shown for `error=failed` and any `error` value the SPA does not know (contract §4.2). */
const FAILED: LoginMessage = { variant: 'danger', text: 'Login failed. Please try again.' };

/** What an unregistered user can do about it (AUTH-6). */
const NOT_REGISTERED_HINT = `Ask a ${PRODUCT_NAME} administrator to add you.`;

/** Message for a backend `error` code from the OAuth callback (contract §4.2; spec AUTH-6/7/14). */
function callbackErrorMessage(error: string, username: string | null): LoginMessage {
  switch (error) {
    case 'not_registered':
      return {
        variant: 'danger',
        text: (
          <>
            Your OpenShift account
            {username ? (
              <>
                {' '}
                <strong>{username}</strong>
              </>
            ) : null}{' '}
            is not registered in {PRODUCT_NAME}. {NOT_REGISTERED_HINT}
          </>
        ),
      };
    case 'deactivated':
      return { variant: 'danger', text: `Your ${PRODUCT_NAME} account is deactivated.` };
    case 'cancelled':
      return { variant: 'info', text: 'Login was cancelled.' };
    case 'unavailable':
      return {
        variant: 'danger',
        text: 'OpenShift login is currently unavailable (host cluster OAuth server did not respond). Existing sessions are not affected.',
      };
    default:
      return FAILED;
  }
}

/**
 * Maps the `/login` query string to the message explaining why the user is here, or `undefined` for a plain visit.
 *
 * Precedence: a backend `error` (the latest login attempt) over the SPA's own `reason=session_ended` (AUTH-11) over
 * `loggedOut=1` (AUTH-10). Pure, so every row of the message table is unit-testable.
 */
export function loginMessage(params: URLSearchParams): LoginMessage | undefined {
  const error = params.get('error');
  if (error !== null) {
    return callbackErrorMessage(error, params.get('username'));
  }
  if (params.get('reason') === 'session_ended') {
    return { variant: 'warning', text: 'Your session ended. Log in again to continue.' };
  }
  if (params.get('loggedOut') === '1') {
    return { variant: 'info', text: 'You have been logged out.' };
  }
  return undefined;
}
