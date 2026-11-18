import type * as Contract from './schema.contract';
import type * as Gen from './schema.gen';

/**
 * Takes each key from `G` when present, else from `C` (ADR-0016). As backend tasks regenerate `schema.gen.ts`, real
 * types replace the provisional contract ones path by path; any deviation surfaces as a type error in callers.
 */
type PreferGenerated<G, C> = {
  [K in keyof G | keyof C]: K extends keyof G ? G[K] : K extends keyof C ? C[K] : never;
};

/** Every FleetConsole API route: generated where it exists, provisional contract otherwise. Use with `apiClient`. */
export type paths = PreferGenerated<Gen.paths, Contract.paths>;

/** Every FleetConsole API schema, merged like {@link paths}. Prefer the named aliases in `./types`. */
export type schemas = PreferGenerated<Gen.components['schemas'], Contract.components['schemas']>;
