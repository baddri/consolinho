// Contract rules for login navigation (contract §4.1, ADR-0014 §4), shared by the auth feature, the app's 401
// handler, the mock backend and the mock-mode dev server. Pure functions: no DOM, no React, relative imports only
// (`vite.config.ts` imports `returnUrl.ts` directly by path).
export { isLoginPath } from './loginPath';
export { buildLoginUrl, sanitizeReturnUrl } from './returnUrl';
