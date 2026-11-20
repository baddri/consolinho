// Public API of the resources feature (ADR-0023): the `c/:cluster` child routes, the registry-driven cluster
// navigation and the one SPA resource-path builder.
export { resourceRoutes } from './routes';
export { useClusterNav, type NavLinkItem, type NavSection } from './nav/useClusterNav';
export { ALL_NAMESPACES, resourcePath, type DetailsTab, type ResourcePathOptions } from './paths';
