import { useMatches, useParams } from 'react-router';
import { ALL_NAMESPACES, type DetailsTab } from './paths';

/** Which list shape a route is: one namespace, all namespaces, or cluster-scoped. */
export type ListScope = 'ns' | 'all' | 'cluster';

/** `handle` of the resource routes (ADR-0023 §1): list scope, plus the tab on details routes. */
export interface ResourceRouteHandle {
  scope: ListScope;
  tab?: DetailsTab;
}

/** The resource route the user is on, decoded from the URL. */
export interface ResourceRoute {
  cluster: string;
  plural: string;
  scope: ListScope;
  /** A namespace, {@link ALL_NAMESPACES}, or `undefined` for cluster-scoped routes. */
  namespace: string | undefined;
  name: string | undefined;
  tab: DetailsTab | undefined;
}

function isResourceHandle(handle: unknown): handle is ResourceRouteHandle {
  return typeof handle === 'object' && handle !== null && 'scope' in handle;
}

/**
 * Reads `:cluster`, `:plural`, `:namespace`, `:name` and the matched route's {@link ResourceRouteHandle}. Only valid
 * under the routes of `routes.tsx` (all of which have `:cluster` and `:plural`).
 */
export function useResourceRoute(): ResourceRoute {
  const { cluster = '', plural = '', namespace, name } = useParams();
  const handle = useMatches().at(-1)?.handle;
  const { scope, tab } = isResourceHandle(handle) ? handle : { scope: 'ns' as const, tab: undefined };
  return {
    cluster,
    plural,
    scope,
    namespace: scope === 'all' ? ALL_NAMESPACES : scope === 'ns' ? namespace : undefined,
    name,
    tab,
  };
}
