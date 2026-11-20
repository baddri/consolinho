/** The login page and anything under it (`/login`, `/login/…`, `/login?…`, `/login#…`), in any letter case. */
const LOGIN_PATH = /^\/login(?:[/?#]|$)/i;

/**
 * Whether `path` (a pathname, or a path with query/hash) is the login page — the one place this rule lives.
 *
 * Case-insensitive because React Router matches routes case-insensitively (`/LOGIN` renders the login page). Used by
 * the 401 handler's redirect-loop guard and by `sanitizeReturnUrl`, which must never send the user back to `/login`.
 */
export function isLoginPath(path: string): boolean {
  return LOGIN_PATH.test(path);
}
