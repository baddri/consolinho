import { createContext } from 'react';

/**
 * Field help for {@link DetailsItem} terms (ADR-0038 §8, OCP `getPropertyDescription`): the kind shown first in the
 * popover's path breadcrumb, and a lookup from an OCP-style dotted path (`spec.strategy.rollingUpdate.maxSurge`) to
 * the cluster schema's description.
 */
export interface FieldHelp {
  /** Kind name heading the path breadcrumb, e.g. `Deployment`. */
  kindLabel: string;
  /** The description of the field at `path`, or `undefined` when the schema has none. */
  describe(path: string): string | undefined;
}

/**
 * Supplies {@link FieldHelp} to the details items below it. `null` (the default, and while the schema is loading or
 * unavailable) keeps every term plain — admin pages never provide it.
 */
export const FieldHelpContext = createContext<FieldHelp | null>(null);
