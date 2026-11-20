import type * as Gen from './schema.gen';

/**
 * Every FleetConsole API route, generated from the Api's OpenAPI document (`npm run gen:api`, ADR-0016). Use with
 * `apiClient`; a backend contract change surfaces as a type error in callers after regeneration.
 */
export type paths = Gen.paths;

/** Every FleetConsole API schema, generated like {@link paths}. Prefer the named aliases in `./types`. */
export type schemas = Gen.components['schemas'];
