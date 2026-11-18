import type { LabelProps } from '@patternfly/react-core';

/** Deployment stage of a managed cluster; drives the coloured label shown next to its name. */
export type ClusterEnvironment = 'production' | 'staging' | 'development';

/** A cluster the current user can switch to. */
export interface ClusterSummary {
  /** URL-safe identifier used in `/c/:cluster/...`. */
  name: string;
  environment: ClusterEnvironment;
}

/**
 * Hard-coded clusters until the Api exposes the user's granted clusters (later checkpoint). The first entry is the
 * default landing cluster.
 */
export const PLACEHOLDER_CLUSTERS: readonly [ClusterSummary, ...ClusterSummary[]] = [
  { name: 'prod-eu-1', environment: 'production' },
  { name: 'prod-us-1', environment: 'production' },
  { name: 'staging-eu-1', environment: 'staging' },
  { name: 'dev-1', environment: 'development' },
];

/** Name of the cluster `/` redirects to. */
export const DEFAULT_CLUSTER = PLACEHOLDER_CLUSTERS[0].name;

const environmentLabels: Record<
  ClusterEnvironment,
  { text: string; color: NonNullable<LabelProps['color']> }
> = {
  production: { text: 'prod', color: 'red' },
  staging: { text: 'staging', color: 'orange' },
  development: { text: 'dev', color: 'green' },
};

/** Label text and colour for an environment — production is red so users always notice where they are. */
export function environmentLabel(environment: ClusterEnvironment) {
  return environmentLabels[environment];
}
