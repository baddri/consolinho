import { currentMockUser, recordAudit } from '../db';
import { getMockUser, setMockUser } from '../session';
import { http } from './http';
import { toCurrentUser } from './representations';

/** `/api/auth` (contract §4.3, §4.4). Login and callback are full-page navigations and never reach MSW. */
export const authHandlers = [
  http.get('/api/auth/me', ({ response }) => {
    // The access guard already answered 401 when there is no (active) session.
    const user = currentMockUser();
    return user ? response(200).json(toCurrentUser(user)) : undefined;
  }),

  // Anonymous allowed, CSRF required (guard), always 204; ends the mock session.
  http.post('/api/auth/logout', ({ response }) => {
    const username = getMockUser();
    if (username !== null) {
      recordAudit({
        action: 'auth.logout',
        category: 'auth',
        targetType: 'session',
        targetId: null,
        targetName: username,
        clusterName: null,
        summary: `${username} logged out.`,
        details: {},
      });
    }
    setMockUser(null);
    return response(204).empty();
  }),
];
