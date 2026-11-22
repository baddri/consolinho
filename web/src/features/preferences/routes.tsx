import { Navigate, type RouteObject } from 'react-router';
import { USER_PREFERENCES_PATH } from './paths';

/**
 * `/user-preferences` (OCP `USER_PREFERENCES_BASE_URL`), mounted by the app under the shell, outside any cluster.
 * The bare path and unknown groups open the only tab, General. The page is a lazy chunk (FRONTEND.md "Routing").
 */
export const preferencesRoute: RouteObject = {
  path: 'user-preferences',
  children: [
    { index: true, element: <Navigate to="general" replace /> },
    {
      path: 'general',
      lazy: () => import('./UserPreferencesPage').then((m) => ({ Component: m.UserPreferencesPage })),
    },
    { path: '*', element: <Navigate to={`${USER_PREFERENCES_PATH}/general`} replace /> },
  ],
};
