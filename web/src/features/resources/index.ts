// Public API of the resources feature (ADR-0023): the `c/:cluster` child routes, the registry-driven cluster
// navigation, the one SPA resource-path builder and the cluster Overview / Cluster Settings paths (for the fleet page).
export { resourceRoutes } from './routes';
export { useClusterNav, type NavLinkItem, type NavSection } from './nav/useClusterNav';
export {
  ALL_NAMESPACES,
  clusterOverviewPath,
  clusterSettingsPath,
  resourcePath,
  type DetailsTab,
  type ResourcePathOptions,
} from './paths';
