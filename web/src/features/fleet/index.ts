// Public API of the fleet feature (ADR-0033 §1): the lazily loaded `/fleet/overview` route. Page modules stay private
// so they remain in their own chunks.
export { fleetRoute } from './routes';
