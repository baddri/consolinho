import { isLoginPath } from './loginPath';

/** Where the SPA starts the OAuth flow (contract §4.1). A full-page navigation target, never `fetch`ed. */
const LOGIN_ENDPOINT = '/api/auth/login';

/** Fallback for every rejected return URL: the app root (the landing redirect picks a cluster). */
const ROOT = '/';

/** ASCII control characters (C0 and DEL); the Api rejects them because they enable header/response splitting. */
// eslint-disable-next-line no-control-regex -- matching control characters is the point of this pattern
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

/** Percent-decodes `value`; `undefined` when it is malformed (e.g. a lone `%`), which is rejected outright. */
function decode(value: string): string | undefined {
  try {
    return decodeURIComponent(value);
  } catch {
    return undefined;
  }
}

/** Whether one form (raw or decoded) of a return URL is a safe local path. */
function isSafeLocalPath(value: string): boolean {
  return (
    value.startsWith('/') &&
    !value.startsWith('//') &&
    !value.includes('\\') &&
    !CONTROL_CHARS.test(value) &&
    !isLoginPath(value)
  );
}

/**
 * Returns `value` if it is a safe post-login destination, else `/` (contract §4.1, AUTH-2, ADR-0014 §4).
 *
 * Same rule as the Api — exactly one leading `/` (so no scheme and no protocol-relative `//host`), no `\`, no control
 * characters — plus the SPA's own loop guard: never the login page. The rule is checked on the raw value **and** its
 * percent-decoded form, so encoded tricks (`/%0d%0a…`, `/%5Cevil`, `/%2F%2Fevil`) are rejected too. Computing the
 * same answer as the Api means the SPA never builds a login link the Api would silently rewrite.
 */
export function sanitizeReturnUrl(value: string | null | undefined): string {
  if (!value) {
    return ROOT;
  }
  const decoded = decode(value);
  return decoded !== undefined && isSafeLocalPath(value) && isSafeLocalPath(decoded) ? value : ROOT;
}

/** URL of the "Log in with OpenShift" link: the Api's login endpoint with the sanitized `returnUrl` (default `/`). */
export function buildLoginUrl(returnUrl?: string | null): string {
  const query = new URLSearchParams({ returnUrl: sanitizeReturnUrl(returnUrl) });
  return `${LOGIN_ENDPOINT}?${query.toString()}`;
}
