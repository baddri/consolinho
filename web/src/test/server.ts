import { setupServer } from 'msw/node';
import { handlers } from './handlers';

/** MSW server shared by all tests; started/reset/stopped in `setup.ts`. */
export const server = setupServer(...handlers);
