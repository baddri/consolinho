import { describe, expect, it } from 'vitest';
import { isLoginPath } from './loginPath';

describe('isLoginPath', () => {
  it.each(['/login', '/LOGIN', '/Login', '/login/', '/login/x', '/login?loggedOut=1', '/login#top'])(
    'matches %s',
    (path) => {
      expect(isLoginPath(path)).toBe(true);
    },
  );

  it.each(['/', '/loginx', '/logins', '/c/prod/login', 'login', '//login', ''])(
    'does not match %s',
    (path) => {
      expect(isLoginPath(path)).toBe(false);
    },
  );
});
