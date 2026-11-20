import { systemInfoFixture } from '../fixtures';
import { http } from './http';

/** `GET /api/system/info` (contract §5, anonymous). */
export const systemHandlers = [
  http.get('/api/system/info', ({ response }) => response(200).json(systemInfoFixture)),
];
